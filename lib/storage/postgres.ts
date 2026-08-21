import { getPool } from "@/lib/db/client";
import type { IbkrFlexReport, ImportedTransaction, OpeningPosition } from "@/lib/integrations/types";
import { buildDashboardModel, buildManualAssetValuation, maskAccount, numberValue, ownerForScope } from "@/lib/core/accounting";
import { defaultAllocationTargets, normaliseAllocationTargets } from "@/northstar/lib/allocation-drift";
import type { Sector } from "@/northstar/types";
import { classifyAsset } from "./classify";
import { PASTED_ORDER_SOURCE } from "./local";
import { getLatestPlatinumPricePostgres, listPriceBookPostgres, recordDailyPricesPostgres, recordPlatinumPricePostgres } from "./postgres/pricing";
import type { AllocationTarget, CashAccount, DailyPriceInput, DashboardData, FxRateInput, ImportResult, ManualAsset, MinerFundamentals, MinerFundamentalsInput, StructuralLevel, StructuralLevelInput, NewSyncRun, OwnerType, PlatinumPrice, PriceBook, PriceImportResult, PastedOpenOrder, Scope, SectorOverride, StorageAdapter, StoredOpenOrder, StoredPosition, StoredTransaction, SyncRun } from "./types";

import {
  captureSnapshot,
  ensureBrokerAccount,
  ensureInstrument,
  ensurePortfolio,
  ibkrTotalCashFromComponents,
  minerFundamentalsFromRow,
  optionalNumber,
  replaceIbkrNavSnapshots,
  replaceIbkrOpenOrders,
  replaceIbkrOpenPositions,
  rebuildIbkrPositions,
  structuralLevelFromRow,
  syncRunFromRow,
  transactionInstrumentCurrency,
  upsertIbkrCash,
} from "./postgres/helpers";

export class PostgresStorageAdapter implements StorageAdapter {
  async importIbkr(report: IbkrFlexReport, ownerType: OwnerType): Promise<ImportResult> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portfolioId = await ensurePortfolio(client, ownerType);
      const accountKey = report.accountId || report.transactions.find(transaction => transaction.externalAccountId)?.externalAccountId || "IBKR";
      const accountId = await ensureBrokerAccount(client, portfolioId, "IBKR", accountKey, "AUD");
      let imported = 0;
      let duplicates = 0;

      for (const transaction of report.transactions) {
        let instrumentId: string | null = null;
        if (transaction.type !== "FX") instrumentId = await ensureInstrument(client, {
          source: "IBKR", externalKey: transaction.instrumentKey || `${transaction.symbol}:${transaction.exchange}`,
          name: transaction.description || transaction.symbol, ticker: transaction.symbol, exchange: transaction.exchange,
          currency: transaction.currency, assetClass: classifyAsset(transaction.symbol, transaction.description || ""),
          conid: transaction.conid, isin: transaction.isin,
        });
        const inserted = await client.query(`
          INSERT INTO transactions (
            portfolio_id, account_id, instrument_id, type, trade_date, settle_date, quantity, price, close_price,
            cost, currency, fees, taxes, net_cash, fx_rate_to_base, realised_pnl, external_id, source, raw
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT (account_id, source, external_id) DO NOTHING
        `, [portfolioId, accountId, instrumentId, transaction.type, transaction.tradeDate, transaction.settleDate || null,
          transaction.quantity ?? null, transaction.price ?? null, transaction.closePrice ?? null, transaction.cost ?? null,
          transaction.currency, transaction.fees ?? 0, transaction.taxes ?? 0, transaction.netCash ?? null,
          transaction.fxRateToBase ?? null, transaction.realisedPnl ?? null, transaction.externalId, transaction.source,
          transaction.raw ? JSON.stringify(transaction.raw) : null]);
        if (inserted.rowCount) imported += 1; else duplicates += 1;
      }

      const positionCount = report.openPositions.length
        ? await replaceIbkrOpenPositions(client, report, portfolioId, accountId)
        : await rebuildIbkrPositions(client, portfolioId, accountId);
      const openOrderCount = await replaceIbkrOpenOrders(client, report, portfolioId, accountId);
      await replaceIbkrNavSnapshots(client, report, portfolioId);
      await upsertIbkrCash(client, report, portfolioId);
      await client.query(`INSERT INTO import_runs (portfolio_id, account_id, source, record_count) VALUES ($1,$2,'IBKR',$3)`, [portfolioId, accountId, report.transactions.length]);
      await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
      const valuationSource = report.openPositions.length
        ? "open_positions_with_trade_overlay"
        : "trade_cost_basis";
      return { source: "IBKR", ownerType, accountKey: maskAccount(accountKey), imported, duplicates, positions: positionCount, openPositions: report.openPositions.length, openOrders: openOrderCount, cashAud: ibkrTotalCashFromComponents(report)?.balanceAud, valuationSource, storageMode: "postgresql" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async importDirectshares(positions: OpeningPosition[], ownerType: OwnerType): Promise<ImportResult> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portfolioId = await ensurePortfolio(client, ownerType);
      const accountKey = positions.find(position => position.externalAccountId)?.externalAccountId || "DIRECTSHARES";
      const accountId = await ensureBrokerAccount(client, portfolioId, "Directshares", accountKey, "AUD");
      await client.query(`DELETE FROM current_positions WHERE account_id=$1 AND source='Directshares CSV'`, [accountId]);
      const asOfDate = new Date().toISOString().slice(0, 10);

      for (const position of positions) {
        const name = position.name || position.symbol;
        const instrumentId = await ensureInstrument(client, {
          source: "Directshares", externalKey: `${position.symbol}:${position.exchange}`, name,
          ticker: position.symbol, exchange: position.exchange, currency: position.currency,
          assetClass: classifyAsset(position.symbol, name),
        });
        await client.query(`
          INSERT INTO current_positions (
            portfolio_id, account_id, instrument_id, source, quantity, last_price, average_cost_aud,
            cost_aud, market_value_aud, day_gain_aud, pnl_aud, pnl_percent, valuation_basis, as_of_date, updated_at
          ) VALUES ($1,$2,$3,'Directshares CSV',$4,$5,$6,$7,$8,$9,$10,$11,'market',$12,NOW())
        `, [portfolioId, accountId, instrumentId, position.quantity, position.lastPrice, position.averageCostAud,
          position.costAud, position.marketValueAud, position.dayGainAud, position.pnlAud, position.pnlPercent, asOfDate]);
      }
      await client.query(`INSERT INTO import_runs (portfolio_id, account_id, source, record_count) VALUES ($1,$2,'Directshares',$3)`, [portfolioId, accountId, positions.length]);
      await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
      return { source: "Directshares", ownerType, accountKey: maskAccount(accountKey), imported: positions.length, duplicates: 0, positions: positions.length, storageMode: "postgresql" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async importDirectsharesTransactions(transactions: ImportedTransaction[], ownerType: OwnerType, importSource = "Directshares Contract Notes"): Promise<ImportResult> {
    if (!transactions.length) throw new Error("No Directshares transactions were supplied.");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portfolioId = await ensurePortfolio(client, ownerType);
      const accountKey = transactions.find(transaction => transaction.externalAccountId)?.externalAccountId || "DIRECTSHARES";
      const accountId = await ensureBrokerAccount(client, portfolioId, "Directshares", accountKey, "AUD");
      let imported = 0;
      let duplicates = 0;

      for (const transaction of transactions) {
        const instrumentId = await ensureInstrument(client, {
          source: "Directshares",
          externalKey: transaction.instrumentKey || `${transaction.symbol}:${transaction.exchange}`,
          name: transaction.description || transaction.symbol,
          ticker: transaction.symbol,
          exchange: transaction.exchange,
          currency: transactionInstrumentCurrency(transaction),
          assetClass: classifyAsset(transaction.symbol, transaction.description || ""),
          isin: transaction.isin,
        });
        const inserted = await client.query(`
          INSERT INTO transactions (
            portfolio_id, account_id, instrument_id, type, trade_date, settle_date, quantity, price, close_price,
            cost, currency, fees, taxes, net_cash, fx_rate_to_base, realised_pnl, external_id, source, raw
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT (account_id, source, external_id) DO NOTHING
        `, [portfolioId, accountId, instrumentId, transaction.type, transaction.tradeDate, transaction.settleDate || null,
          transaction.quantity ?? null, transaction.price ?? null, transaction.closePrice ?? null, transaction.cost ?? null,
          transaction.currency, transaction.fees ?? 0, transaction.taxes ?? 0, transaction.netCash ?? null,
          transaction.fxRateToBase ?? null, transaction.realisedPnl ?? null, transaction.externalId, transaction.source,
          transaction.raw ? JSON.stringify(transaction.raw) : null]);
        if (inserted.rowCount) imported += 1; else duplicates += 1;
      }

      await client.query(`INSERT INTO import_runs (portfolio_id, account_id, source, record_count) VALUES ($1,$2,$3,$4)`, [portfolioId, accountId, importSource, transactions.length]);
      const positionCount = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM current_positions WHERE account_id=$1`, [accountId]);
      await client.query("COMMIT");
      return { source: importSource, ownerType, accountKey: maskAccount(accountKey), imported, duplicates, positions: numberValue(positionCount.rows[0]?.count), storageMode: "postgresql" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listTransactions(ownerType?: OwnerType): Promise<StoredTransaction[]> {
    const values: unknown[] = [];
    const ownerFilter = ownerType ? "WHERE p.legal_owner_type=$1" : "";
    if (ownerType) values.push(ownerType);
    const result = await getPool().query(`
      SELECT t.id, p.legal_owner_type, ba.broker, ba.external_account_id, t.external_id,
        t.trade_date::text, t.settle_date::text, i.ticker, i.exchange, i.name, i.external_key,
        t.type, t.quantity::text, t.price::text, t.close_price::text, t.cost::text, t.currency,
        t.fees::text, t.taxes::text, t.net_cash::text, t.fx_rate_to_base::text, t.realised_pnl::text,
        t.source, t.raw, i.isin, i.conid
      FROM transactions t
      JOIN portfolios p ON p.id=t.portfolio_id
      JOIN broker_accounts ba ON ba.id=t.account_id
      JOIN instruments i ON i.id=t.instrument_id
      ${ownerFilter}
      ORDER BY t.trade_date, t.created_at
    `, values);
    return result.rows.map(row => ({
      id: row.id,
      ownerType: row.legal_owner_type,
      broker: row.broker,
      accountKey: row.external_account_id,
      externalId: row.external_id,
      externalAccountId: row.external_account_id,
      tradeDate: row.trade_date,
      settleDate: row.settle_date ?? undefined,
      symbol: row.ticker,
      exchange: row.exchange,
      description: row.name,
      instrumentKey: row.external_key,
      isin: row.isin ?? undefined,
      conid: row.conid ?? undefined,
      type: row.type,
      quantity: optionalNumber(row.quantity),
      price: optionalNumber(row.price),
      closePrice: optionalNumber(row.close_price),
      cost: optionalNumber(row.cost),
      currency: row.currency,
      fees: optionalNumber(row.fees),
      taxes: optionalNumber(row.taxes),
      netCash: optionalNumber(row.net_cash),
      fxRateToBase: optionalNumber(row.fx_rate_to_base),
      realisedPnl: optionalNumber(row.realised_pnl),
      source: row.source,
      raw: row.raw ?? undefined,
    }));
  }

  async listCashAccounts(ownerType?: OwnerType, options: { includeInactive?: boolean } = {}): Promise<CashAccount[]> {
    const values: unknown[] = [];
    const clauses = options.includeInactive ? [] : ["c.is_active=true"];
    if (ownerType) {
      values.push(ownerType);
      clauses.push(`p.legal_owner_type=$${values.length}`);
    }
    const filter = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await getPool().query(`
      SELECT c.id, p.legal_owner_type, c.institution, c.name, c.currency, c.balance, c.balance_aud,
        c.fx_rate_to_aud, c.as_of_date::text, c.updated_at::text, c.is_active
      FROM cash_accounts c JOIN portfolios p ON p.id=c.portfolio_id
      ${filter} ORDER BY c.institution, c.name
    `, values);
    return result.rows.map(row => ({ id: row.id, ownerType: row.legal_owner_type, institution: row.institution,
      name: row.name, currency: row.currency, balance: numberValue(row.balance), balanceAud: numberValue(row.balance_aud),
      fxRateToAud: numberValue(row.fx_rate_to_aud), asOfDate: row.as_of_date, updatedAt: row.updated_at, isActive: Boolean(row.is_active) }));
  }

  async upsertCashAccount(input: Omit<CashAccount, "id" | "updatedAt" | "balanceAud"> & { id?: string }): Promise<CashAccount> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portfolioId = await ensurePortfolio(client, input.ownerType);
      const balanceAud = input.balance * input.fxRateToAud;
      const result = input.id
        ? await client.query(`UPDATE cash_accounts SET institution=$1,name=$2,currency=$3,balance=$4,fx_rate_to_aud=$5,balance_aud=$6,as_of_date=$7,updated_at=NOW() WHERE id=$8 AND portfolio_id=$9 RETURNING id, updated_at::text`, [input.institution, input.name, input.currency, input.balance, input.fxRateToAud, balanceAud, input.asOfDate, input.id, portfolioId])
        : await client.query(`
            INSERT INTO cash_accounts (portfolio_id,institution,name,currency,balance,fx_rate_to_aud,balance_aud,as_of_date,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
            ON CONFLICT (portfolio_id,institution,name) DO UPDATE SET currency=EXCLUDED.currency,balance=EXCLUDED.balance,
              fx_rate_to_aud=EXCLUDED.fx_rate_to_aud,balance_aud=EXCLUDED.balance_aud,as_of_date=EXCLUDED.as_of_date,updated_at=NOW()
            RETURNING id, updated_at::text
          `, [portfolioId, input.institution, input.name, input.currency, input.balance, input.fxRateToAud, balanceAud, input.asOfDate]);
      if (!result.rows[0]) throw new Error("Cash account was not found.");
      await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
      return { ...input, id: result.rows[0].id, balanceAud, updatedAt: result.rows[0].updated_at };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listManualAssets(ownerType?: OwnerType): Promise<ManualAsset[]> {
    const values: unknown[] = [];
    const filter = ownerType ? "WHERE p.legal_owner_type=$1" : "";
    if (ownerType) values.push(ownerType);
    const result = await getPool().query(`
      SELECT ma.id,p.legal_owner_type,ma.asset_type,ma.name,ma.quantity_kg,ma.total_cost_aud,
        ma.buyback_aud_per_kg,ma.retail_aud_per_kg,ma.market_value_aud,ma.price_provider,
        ma.price_source_url,ma.price_retrieved_at::text,ma.purchase_date::text,ma.as_of_date::text,ma.updated_at::text
      FROM manual_assets ma JOIN portfolios p ON p.id=ma.portfolio_id
      ${filter} ORDER BY ma.purchase_date DESC, ma.name
    `, values);
    return result.rows.map(row => {
      const quantityKg = numberValue(row.quantity_kg);
      const totalCostAud = numberValue(row.total_cost_aud);
      const buybackAudPerKg = numberValue(row.buyback_aud_per_kg);
      const retailAudPerKg = numberValue(row.retail_aud_per_kg);
      const marketValueAud = numberValue(row.market_value_aud);
      const valuation = buildManualAssetValuation({ quantityKg, totalCostAud, buybackAudPerKg, retailAudPerKg });
      return { id: row.id, ownerType: row.legal_owner_type, assetType: row.asset_type, name: row.name,
        quantityKg, totalCostAud, costAudPerKg: valuation.costAudPerKg,
        buybackAudPerKg, retailAudPerKg, marketValueAud,
        pnlAud: marketValueAud - totalCostAud,
        pnlPercent: valuation.pnlPercent,
        dealerSpreadAudPerKg: valuation.dealerSpreadAudPerKg, dealerSpreadPercent: valuation.dealerSpreadPercent,
        priceProvider: row.price_provider, priceSourceUrl: row.price_source_url,
        purchaseDate: row.purchase_date, asOfDate: row.as_of_date,
        priceRetrievedAt: row.price_retrieved_at ? new Date(row.price_retrieved_at).toISOString() : null,
        updatedAt: new Date(row.updated_at).toISOString() } as ManualAsset;
    });
  }

  async upsertManualAsset(input: Omit<ManualAsset, "id" | "updatedAt" | "marketValueAud" | "pnlAud" | "pnlPercent" | "costAudPerKg" | "dealerSpreadAudPerKg" | "dealerSpreadPercent"> & { id?: string }): Promise<ManualAsset> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portfolioId = await ensurePortfolio(client, input.ownerType);
      const marketValueAud = input.quantityKg * input.buybackAudPerKg;
      const quantityTroyOz = input.quantityKg * 32.1507465686;
      const currentPriceAudPerOz = input.buybackAudPerKg / 32.1507465686;
      const result = input.id
        ? await client.query(`
            UPDATE manual_assets SET asset_type=$16,name=$1,quantity_kg=$2,quantity_troy_oz=$3,
              total_cost_aud=$4,buyback_aud_per_kg=$5,retail_aud_per_kg=$6,current_price_aud_per_oz=$7,
              market_value_aud=$8,price_provider=$9,price_source_url=$10,price_retrieved_at=$11,
              purchase_date=$12,as_of_date=$13,updated_at=NOW()
            WHERE id=$14 AND portfolio_id=$15 RETURNING id,updated_at::text
          `, [input.name, input.quantityKg, quantityTroyOz, input.totalCostAud, input.buybackAudPerKg,
            input.retailAudPerKg, currentPriceAudPerOz, marketValueAud, input.priceProvider,
            input.priceSourceUrl, input.priceRetrievedAt, input.purchaseDate, input.asOfDate, input.id, portfolioId, input.assetType])
        : await client.query(`
            INSERT INTO manual_assets (portfolio_id,asset_type,name,quantity_kg,quantity_troy_oz,total_cost_aud,
              buyback_aud_per_kg,retail_aud_per_kg,current_price_aud_per_oz,market_value_aud,price_provider,
              price_source_url,price_retrieved_at,purchase_date,as_of_date,updated_at)
            VALUES ($1,$15,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
            RETURNING id,updated_at::text
          `, [portfolioId, input.name, input.quantityKg, quantityTroyOz, input.totalCostAud,
            input.buybackAudPerKg, input.retailAudPerKg, currentPriceAudPerOz, marketValueAud,
            input.priceProvider, input.priceSourceUrl, input.priceRetrievedAt, input.purchaseDate, input.asOfDate, input.assetType]);
      if (!result.rows[0]) throw new Error("Physical metal position was not found.");
      await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
      const valuation = buildManualAssetValuation(input);
      return { id: result.rows[0].id, ownerType: input.ownerType, assetType: input.assetType, name: input.name,
        quantityKg: input.quantityKg, totalCostAud: input.totalCostAud,
        costAudPerKg: valuation.costAudPerKg,
        buybackAudPerKg: input.buybackAudPerKg, retailAudPerKg: input.retailAudPerKg,
        marketValueAud, pnlAud: valuation.pnlAud, pnlPercent: valuation.pnlPercent,
        dealerSpreadAudPerKg: valuation.dealerSpreadAudPerKg, dealerSpreadPercent: valuation.dealerSpreadPercent,
        priceProvider: input.priceProvider, priceSourceUrl: input.priceSourceUrl,
        purchaseDate: input.purchaseDate, asOfDate: input.asOfDate, priceRetrievedAt: input.priceRetrievedAt,
        updatedAt: result.rows[0].updated_at };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async deleteManualAsset(id: string, ownerType: OwnerType) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portfolioId = await ensurePortfolio(client, ownerType);
      await client.query(`DELETE FROM manual_assets WHERE id=$1 AND portfolio_id=$2`, [id, portfolioId]);
      await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listPriceBook(limit = 80): Promise<PriceBook> {
    return listPriceBookPostgres(limit);
  }

  async recordDailyPrices(prices: DailyPriceInput[], fxRates: FxRateInput[] = []): Promise<PriceImportResult> {
    return recordDailyPricesPostgres(prices, fxRates);
  }

  async getLatestPlatinumPrice(): Promise<PlatinumPrice | null> {
    return getLatestPlatinumPricePostgres();
  }

  async recordPlatinumPrice(price: PlatinumPrice): Promise<PlatinumPrice> {
    return recordPlatinumPricePostgres(price);
  }

  async recordSyncRun(input: NewSyncRun): Promise<SyncRun> {
    const finishedAt = input.finishedAt ?? new Date().toISOString();
    const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(input.startedAt).getTime());
    const result = await getPool().query(`
      INSERT INTO sync_runs (
        source, owner_type, trigger, status, started_at, finished_at, duration_ms,
        record_count, position_count, cash_aud, message, error
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id,source,owner_type,trigger,status,started_at,finished_at,duration_ms,
        record_count,position_count,cash_aud,message,error
    `, [
      input.source,
      input.ownerType ?? null,
      input.trigger,
      input.status,
      input.startedAt,
      finishedAt,
      Number.isFinite(durationMs) ? durationMs : null,
      input.recordCount ?? null,
      input.positionCount ?? null,
      input.cashAud ?? null,
      input.message ?? null,
      input.error ?? null,
    ]);
    return syncRunFromRow(result.rows[0]);
  }


  async replacePastedOpenOrders(ownerType: OwnerType, orders: PastedOpenOrder[]): Promise<number> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portfolioId = await ensurePortfolio(client, ownerType);
      // Only the pasted source is cleared, so a Flex sync and a paste cannot erase each other.
      await client.query(
        `DELETE FROM ibkr_open_orders oo USING broker_accounts ba
         WHERE oo.account_id=ba.id AND oo.portfolio_id=$1 AND oo.source=$2`,
        [portfolioId, PASTED_ORDER_SOURCE],
      );
      const asOfDate = new Date().toISOString().slice(0, 10);
      for (const order of orders) {
        const accountId = await ensureBrokerAccount(client, portfolioId, "IBKR", order.accountKey, order.currency || "AUD");
        await client.query(`
          INSERT INTO ibkr_open_orders (
            portfolio_id,account_id,order_id,conid,symbol,name,exchange,currency,side,status,order_type,time_in_force,
            total_quantity,filled_quantity,remaining_quantity,limit_price,stop_price,average_price,description,source,raw,as_of_date,updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
          ON CONFLICT (account_id, order_id, source) DO UPDATE SET
            conid=EXCLUDED.conid,symbol=EXCLUDED.symbol,name=EXCLUDED.name,exchange=EXCLUDED.exchange,currency=EXCLUDED.currency,
            side=EXCLUDED.side,status=EXCLUDED.status,order_type=EXCLUDED.order_type,time_in_force=EXCLUDED.time_in_force,
            total_quantity=EXCLUDED.total_quantity,filled_quantity=EXCLUDED.filled_quantity,remaining_quantity=EXCLUDED.remaining_quantity,
            limit_price=EXCLUDED.limit_price,stop_price=EXCLUDED.stop_price,average_price=EXCLUDED.average_price,
            description=EXCLUDED.description,raw=EXCLUDED.raw,as_of_date=EXCLUDED.as_of_date,updated_at=NOW()
        `, [portfolioId, accountId, order.orderId, order.conid, order.symbol, order.name, order.exchange, order.currency,
          order.side, order.status, order.orderType, order.timeInForce, order.totalQuantity, order.filledQuantity,
          order.remainingQuantity, order.limitPrice, order.stopPrice, order.averagePrice, order.description,
          PASTED_ORDER_SOURCE, order.raw, asOfDate]);
      }
      await client.query("COMMIT");
      return orders.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listOpenOrders(ownerType?: OwnerType): Promise<StoredOpenOrder[]> {
    const values: unknown[] = [];
    const ownerFilter = ownerType ? "WHERE p.legal_owner_type=$1" : "";
    if (ownerType) values.push(ownerType);
    const result = await getPool().query(`
      SELECT oo.id, p.legal_owner_type, ba.broker, ba.external_account_id, oo.order_id, oo.conid,
        oo.symbol, oo.name, oo.exchange, oo.currency, oo.side, oo.status, oo.order_type, oo.time_in_force,
        oo.total_quantity::text, oo.filled_quantity::text, oo.remaining_quantity::text, oo.limit_price::text,
        oo.stop_price::text, oo.average_price::text, oo.description, oo.source, oo.raw, oo.as_of_date::text,
        oo.created_at::text, oo.updated_at::text
      FROM ibkr_open_orders oo
      JOIN portfolios p ON p.id=oo.portfolio_id
      JOIN broker_accounts ba ON ba.id=oo.account_id
      ${ownerFilter}
      ORDER BY oo.updated_at DESC, oo.symbol ASC
    `, values).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return null;
      throw error;
    });
    if (!result) return [];
    return result.rows.map(row => ({
      id: row.id, ownerType: row.legal_owner_type as OwnerType, broker: row.broker, accountKey: row.external_account_id,
      orderId: row.order_id, conid: row.conid ?? "", symbol: row.symbol, name: row.name, exchange: row.exchange, currency: row.currency,
      side: row.side, status: row.status, orderType: row.order_type, timeInForce: row.time_in_force,
      totalQuantity: row.total_quantity == null ? null : numberValue(row.total_quantity),
      filledQuantity: row.filled_quantity == null ? null : numberValue(row.filled_quantity),
      remainingQuantity: row.remaining_quantity == null ? null : numberValue(row.remaining_quantity),
      limitPrice: row.limit_price == null ? null : numberValue(row.limit_price),
      stopPrice: row.stop_price == null ? null : numberValue(row.stop_price),
      averagePrice: row.average_price == null ? null : numberValue(row.average_price),
      description: row.description, source: row.source, raw: row.raw ?? undefined, asOfDate: row.as_of_date,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null, updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async listSyncRuns(limit = 20, ownerType?: OwnerType): Promise<SyncRun[]> {
    const values: unknown[] = [Math.max(1, Math.min(100, limit))];
    const filter = ownerType ? "WHERE owner_type=$2 OR owner_type IS NULL" : "";
    if (ownerType) values.push(ownerType);
    const result = await getPool().query(`
      SELECT id,source,owner_type,trigger,status,started_at,finished_at,duration_ms,
        record_count,position_count,cash_aud,message,error
      FROM sync_runs
      ${filter}
      ORDER BY finished_at DESC
      LIMIT $1
    `, values);
    return result.rows.map(syncRunFromRow);
  }

  async listSectorOverrides(): Promise<SectorOverride[]> {
    // Tolerate the table not existing yet, the same way allocation targets do, so a deploy that
    // has not run migrations still serves the dashboard instead of failing outright.
    const result = await getPool().query(`
      SELECT symbol, sector, updated_at::text
      FROM sector_overrides
      ORDER BY symbol
    `).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return null;
      throw error;
    });
    if (!result) return [];
    return result.rows.map(row => ({
      symbol: String(row.symbol).toUpperCase(),
      sector: row.sector as Sector,
      updatedAt: String(row.updated_at),
    }));
  }

  async setSectorOverride(symbol: string, sector: Sector): Promise<SectorOverride> {
    const key = symbol.trim().toUpperCase();
    const result = await getPool().query(`
      INSERT INTO sector_overrides (symbol, sector, updated_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (symbol) DO UPDATE SET sector=EXCLUDED.sector, updated_at=NOW()
      RETURNING symbol, sector, updated_at::text
    `, [key, sector]);
    const row = result.rows[0];
    return { symbol: String(row.symbol).toUpperCase(), sector: row.sector as Sector, updatedAt: String(row.updated_at) };
  }

  async clearSectorOverride(symbol: string): Promise<void> {
    await getPool().query(`DELETE FROM sector_overrides WHERE symbol=$1`, [symbol.trim().toUpperCase()]);
  }

  async listAllocationTargets(): Promise<AllocationTarget[]> {
    const result = await getPool().query(`
      SELECT sector,target_percent,updated_at::text
      FROM allocation_targets
      ORDER BY sector
    `).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return null;
      throw error;
    });
    if (!result || !result.rows.length) return defaultAllocationTargets();
    return normaliseAllocationTargets(result.rows.map(row => ({
      sector: row.sector,
      targetPercent: numberValue(row.target_percent),
      updatedAt: new Date(row.updated_at).toISOString(),
    })));
  }

  async upsertAllocationTargets(targets: Array<Omit<AllocationTarget, "updatedAt">>): Promise<AllocationTarget[]> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const now = new Date().toISOString();
      for (const target of normaliseAllocationTargets(targets.map(item => ({ ...item, updatedAt: now })))) {
        await client.query(`
          INSERT INTO allocation_targets (sector,target_percent,updated_at)
          VALUES ($1,$2,NOW())
          ON CONFLICT (sector) DO UPDATE SET target_percent=EXCLUDED.target_percent,updated_at=NOW()
        `, [target.sector, target.targetPercent]);
      }
      await client.query("COMMIT");
      return this.listAllocationTargets();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listMinerFundamentals(symbols?: string[]): Promise<MinerFundamentals[]> {
    const requested = symbols?.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean) ?? [];
    const result = await getPool().query(`
      SELECT symbol,name,primary_metal,jurisdiction,project_stage,production_oz,aisc_usd_per_oz,
        resource_moz,reserve_moz,cash_aud,debt_aud,market_cap_aud,npv_aud,capex_aud,irr_percent,
        jurisdiction_score,balance_sheet_score,dilution_score,management_score,notes,source_url,
        as_of_date::text,updated_at::text
      FROM miner_fundamentals
      WHERE $1::text[] = '{}'::text[] OR symbol = ANY($1::text[])
      ORDER BY symbol
    `, [requested]).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return null;
      throw error;
    });
    return result ? result.rows.map(minerFundamentalsFromRow) : [];
  }

  async upsertMinerFundamentals(input: MinerFundamentalsInput): Promise<MinerFundamentals> {
    const result = await getPool().query(`
      INSERT INTO miner_fundamentals (
        symbol,name,primary_metal,jurisdiction,project_stage,production_oz,aisc_usd_per_oz,
        resource_moz,reserve_moz,cash_aud,debt_aud,market_cap_aud,npv_aud,capex_aud,irr_percent,
        jurisdiction_score,balance_sheet_score,dilution_score,management_score,notes,source_url,as_of_date,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
      ON CONFLICT (symbol) DO UPDATE SET
        name=EXCLUDED.name,primary_metal=EXCLUDED.primary_metal,jurisdiction=EXCLUDED.jurisdiction,
        project_stage=EXCLUDED.project_stage,production_oz=EXCLUDED.production_oz,aisc_usd_per_oz=EXCLUDED.aisc_usd_per_oz,
        resource_moz=EXCLUDED.resource_moz,reserve_moz=EXCLUDED.reserve_moz,cash_aud=EXCLUDED.cash_aud,
        debt_aud=EXCLUDED.debt_aud,market_cap_aud=EXCLUDED.market_cap_aud,npv_aud=EXCLUDED.npv_aud,
        capex_aud=EXCLUDED.capex_aud,irr_percent=EXCLUDED.irr_percent,jurisdiction_score=EXCLUDED.jurisdiction_score,
        balance_sheet_score=EXCLUDED.balance_sheet_score,dilution_score=EXCLUDED.dilution_score,
        management_score=EXCLUDED.management_score,notes=EXCLUDED.notes,source_url=EXCLUDED.source_url,
        as_of_date=EXCLUDED.as_of_date,updated_at=NOW()
      RETURNING symbol,name,primary_metal,jurisdiction,project_stage,production_oz,aisc_usd_per_oz,
        resource_moz,reserve_moz,cash_aud,debt_aud,market_cap_aud,npv_aud,capex_aud,irr_percent,
        jurisdiction_score,balance_sheet_score,dilution_score,management_score,notes,source_url,
        as_of_date::text,updated_at::text
    `, [
      input.symbol.trim().toUpperCase(), input.name, input.primaryMetal, input.jurisdiction, input.projectStage,
      input.productionOz, input.aiscUsdPerOz, input.resourceMoz, input.reserveMoz, input.cashAud, input.debtAud,
      input.marketCapAud, input.npvAud, input.capexAud, input.irrPercent, input.jurisdictionScore,
      input.balanceSheetScore, input.dilutionScore, input.managementScore, input.notes, input.sourceUrl, input.asOfDate,
    ]);
    return minerFundamentalsFromRow(result.rows[0]);
  }

  async listStructuralLevels(symbols?: string[]): Promise<StructuralLevel[]> {
    const requested = symbols?.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean) ?? [];
    const result = await getPool().query(`
      SELECT id::text,symbol,comparison_symbol,label,timeframe,direction,level,status,source,notes,as_of_date::text,updated_at::text
      FROM structural_levels
      WHERE $1::text[] = '{}'::text[] OR symbol = ANY($1::text[]) OR comparison_symbol = ANY($1::text[])
      ORDER BY symbol,timeframe,level
    `, [requested]).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return null;
      throw error;
    });
    return result ? result.rows.map(structuralLevelFromRow) : [];
  }

  async upsertStructuralLevel(input: StructuralLevelInput): Promise<StructuralLevel> {
    const result = await getPool().query(`
      INSERT INTO structural_levels (id,symbol,comparison_symbol,label,timeframe,direction,level,status,source,notes,as_of_date,updated_at)
      VALUES (COALESCE($1::uuid, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (id) DO UPDATE SET
        symbol=EXCLUDED.symbol,comparison_symbol=EXCLUDED.comparison_symbol,label=EXCLUDED.label,
        timeframe=EXCLUDED.timeframe,direction=EXCLUDED.direction,level=EXCLUDED.level,status=EXCLUDED.status,
        source=EXCLUDED.source,notes=EXCLUDED.notes,as_of_date=EXCLUDED.as_of_date,updated_at=NOW()
      RETURNING id::text,symbol,comparison_symbol,label,timeframe,direction,level,status,source,notes,as_of_date::text,updated_at::text
    `, [
      input.id ?? null, input.symbol.trim().toUpperCase(), input.comparisonSymbol.trim().toUpperCase(), input.label.trim(),
      input.timeframe, input.direction, input.level, input.status, input.source, input.notes, input.asOfDate,
    ]);
    return structuralLevelFromRow(result.rows[0]);
  }

  async deleteStructuralLevel(id: string): Promise<void> {
    await getPool().query(`DELETE FROM structural_levels WHERE id=$1`, [id]);
  }

  async dashboard(scope: Scope): Promise<DashboardData> {
    const ownerType = ownerForScope(scope);
    const values: unknown[] = [];
    const ownerFilter = ownerType ? "AND p.legal_owner_type=$1" : "";
    if (ownerType) values.push(ownerType);

    const positionRows = await getPool().query(`
      SELECT cp.id,p.legal_owner_type,ba.broker,ba.external_account_id,i.external_key,i.ticker,i.name,
        i.exchange,i.currency,i.asset_class,cp.quantity,cp.last_price,cp.average_cost_aud,cp.cost_aud,
        cp.market_value_aud,cp.day_gain_aud,cp.pnl_aud,cp.pnl_percent,cp.valuation_basis,cp.as_of_date::text,cp.source
      FROM current_positions cp JOIN portfolios p ON p.id=cp.portfolio_id
      JOIN broker_accounts ba ON ba.id=cp.account_id JOIN instruments i ON i.id=cp.instrument_id
      WHERE 1=1 ${ownerFilter}
    `, values);
    const positions: StoredPosition[] = positionRows.rows.map(row => ({
      id: row.id, ownerType: row.legal_owner_type, broker: row.broker, accountKey: row.external_account_id,
      instrumentKey: row.external_key, symbol: row.ticker, name: row.name, exchange: row.exchange,
      currency: row.currency, assetClass: row.asset_class, quantity: numberValue(row.quantity),
      lastPrice: row.last_price == null ? null : numberValue(row.last_price), averageCostAud: numberValue(row.average_cost_aud),
      costAud: numberValue(row.cost_aud), marketValueAud: numberValue(row.market_value_aud), dayGainAud: numberValue(row.day_gain_aud),
      pnlAud: numberValue(row.pnl_aud), pnlPercent: numberValue(row.pnl_percent), valuationBasis: row.valuation_basis,
      asOfDate: row.as_of_date, source: row.source,
    }));

    const manualAssets = await this.listManualAssets(ownerType);
    const cashAccounts = await this.listCashAccounts(ownerType, { includeInactive: true });
    const transactions = await this.listTransactions(ownerType);

    const snapshotRows = await getPool().query(`
      SELECT ps.captured_at::date::text AS day,p.legal_owner_type,
        (ARRAY_AGG(ps.captured_at::text ORDER BY ps.captured_at DESC))[1] AS captured_at,
        (ARRAY_AGG(ps.market_value ORDER BY ps.captured_at DESC))[1]::text AS market_value,
        (ARRAY_AGG(ps.cash_value ORDER BY ps.captured_at DESC))[1]::text AS cash_value
      FROM portfolio_snapshots ps JOIN portfolios p ON p.id=ps.portfolio_id
      WHERE 1=1 ${ownerFilter} GROUP BY ps.captured_at::date,p.legal_owner_type ORDER BY day DESC LIMIT 2000
    `, values);

    const importRows=await getPool().query(`
      SELECT ir.source,ir.record_count,ir.imported_at::text,p.legal_owner_type,ba.external_account_id
      FROM import_runs ir JOIN portfolios p ON p.id=ir.portfolio_id JOIN broker_accounts ba ON ba.id=ir.account_id
      WHERE ir.id IN (SELECT DISTINCT ON (account_id,source) id FROM import_runs ORDER BY account_id,source,imported_at DESC)
      ${ownerType?"AND p.legal_owner_type=$1":""}
    `,values);
    const syncRuns = await this.listSyncRuns(8, ownerType);
    const allocationTargets = await this.listAllocationTargets();
    const sectorOverrides = await this.listSectorOverrides();

    return buildDashboardModel({
      sectorOverrides,
      scope,
      storageMode: "postgresql",
      positions,
      manualAssets,
      cashAccounts,
      transactions,
      imports: importRows.rows.map(row => ({
        source: row.source,
        ownerType: row.legal_owner_type as OwnerType,
        importedAt: new Date(row.imported_at).toISOString(),
        recordCount: numberValue(row.record_count),
        accountKey: row.external_account_id,
      })),
      snapshots: snapshotRows.rows.map(row => ({
        ownerType: row.legal_owner_type as OwnerType,
        capturedAt: new Date(row.captured_at ?? row.day).toISOString(),
        marketValue: numberValue(row.market_value),
        cashValue: numberValue(row.cash_value),
      })),
      syncRuns,
      allocationTargets,
    });
  }
}

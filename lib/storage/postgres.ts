import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import type { IbkrFlexReport, ImportedTransaction, OpeningPosition } from "@/lib/integrations/types";
import { defaultAllocationTargets, normaliseAllocationTargets } from "@/northstar/lib/allocation-drift";
import { classifyAsset } from "./classify";
import { buildCurrencyExposure } from "./exposure";
import { buildValuationFreshness } from "./freshness";
import { buildIncomeSummary } from "./income";
import { buildPeriodReturns, type NavPoint } from "./returns";
import { buildXirrSummary } from "./xirr";
import type { AllocationTarget, CashAccount, DailyPriceInput, DashboardData, FxRateInput, ImportResult, ManualAsset, NewSyncRun, OwnerType, PlatinumPrice, PriceBook, PriceImportResult, Scope, StorageAdapter, StoredPosition, StoredTransaction, SyncRun } from "./types";

const maskAccount = (account: string) => account.length <= 4 ? account : `${account.slice(0, 2)}••••${account.slice(-3)}`;
const numberValue = (value: unknown) => Number(value ?? 0);
const optionalNumber = (value: unknown) => value == null ? undefined : Number(value);
const ownerForScope = (scope: Scope): OwnerType | undefined => scope === "personal" ? "PERSONAL" : scope === "smsf" ? "SMSF" : undefined;
const normaliseCurrency = (value: string) => value.trim().toUpperCase();
const normaliseSymbol = (value: string) => value.trim().toUpperCase();

async function ensurePortfolio(client: PoolClient, ownerType: OwnerType) {
  // Preserve existing installations while correcting the displayed product name.
  const previousProductName = ["North", "Star"].join(" ");
  await client.query(`
    UPDATE portfolio_groups
    SET name = 'NorthStar'
    WHERE name = $1
      AND NOT EXISTS (SELECT 1 FROM portfolio_groups WHERE name = 'NorthStar')
  `, [previousProductName]);
  const group = await client.query<{ id: string }>(`
    INSERT INTO portfolio_groups (name, base_currency)
    VALUES ('NorthStar', 'AUD')
    ON CONFLICT (name) DO UPDATE SET base_currency = EXCLUDED.base_currency
    RETURNING id
  `);
  const name = ownerType === "SMSF" ? "SMSF" : "Personal";
  const portfolio = await client.query<{ id: string }>(`
    INSERT INTO portfolios (group_id, name, legal_owner_type, base_currency)
    VALUES ($1, $2, $3, 'AUD')
    ON CONFLICT (legal_owner_type) DO UPDATE SET name = EXCLUDED.name, group_id = EXCLUDED.group_id
    RETURNING id
  `, [group.rows[0].id, name, ownerType]);
  return portfolio.rows[0].id;
}

async function ensureBrokerAccount(client: PoolClient, portfolioId: string, broker: string, accountKey: string, currency = "AUD") {
  const result = await client.query<{ id: string }>(`
    INSERT INTO broker_accounts (portfolio_id, broker, external_account_id, currency, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (portfolio_id, broker, external_account_id)
    DO UPDATE SET currency = EXCLUDED.currency, updated_at = NOW()
    RETURNING id
  `, [portfolioId, broker, accountKey, currency]);
  return result.rows[0].id;
}

async function ensureInstrument(client: PoolClient, input: {
  source: string;
  externalKey: string;
  name: string;
  ticker: string;
  exchange: string;
  currency: string;
  assetClass: string;
  conid?: string;
  isin?: string;
}) {
  const result = await client.query<{ id: string }>(`
    INSERT INTO instruments (source, external_key, name, ticker, exchange, currency, asset_class, conid, isin)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (source, external_key)
    DO UPDATE SET name=EXCLUDED.name, ticker=EXCLUDED.ticker, exchange=EXCLUDED.exchange,
      currency=EXCLUDED.currency, asset_class=EXCLUDED.asset_class, conid=EXCLUDED.conid, isin=EXCLUDED.isin
    RETURNING id
  `, [input.source, input.externalKey, input.name, input.ticker, input.exchange, input.currency, input.assetClass, input.conid ?? null, input.isin ?? null]);
  return result.rows[0].id;
}

async function latestFxRate(client: PoolClient, currency: string, priceDate: string) {
  if (normaliseCurrency(currency) === "AUD") return 1;
  const result = await client.query<{ rate_to_aud: string }>(`
    SELECT rate_to_aud::text
    FROM fx_rates
    WHERE currency=$1 AND rate_date <= $2
    ORDER BY rate_date DESC, retrieved_at DESC
    LIMIT 1
  `, [normaliseCurrency(currency), priceDate]);
  return result.rows[0] ? numberValue(result.rows[0].rate_to_aud) : null;
}

async function captureSnapshot(client: PoolClient, portfolioId: string) {
  const totals = await client.query<{ market_value: string; cash_value: string }>(`
    SELECT
      (
        COALESCE((SELECT SUM(market_value_aud) FROM current_positions WHERE portfolio_id=$1),0)
        + COALESCE((SELECT SUM(market_value_aud) FROM manual_assets WHERE portfolio_id=$1),0)
      )::text AS market_value,
      COALESCE((SELECT SUM(balance_aud) FROM cash_accounts WHERE portfolio_id=$1 AND is_active=true),0)::text AS cash_value
  `, [portfolioId]);
  await client.query(`
    INSERT INTO portfolio_snapshots (portfolio_id, market_value, cash_value, net_contributions)
    VALUES ($1,$2,$3,0)
  `, [portfolioId, totals.rows[0].market_value, totals.rows[0].cash_value]);
}

async function rebuildIbkrPositions(client: PoolClient, portfolioId: string, accountId: string) {
  const rows = await client.query<{
    instrument_id: string; quantity: string; cost_aud: string; last_price: string | null; as_of_date: string;
  }>(`
    SELECT i.id AS instrument_id,
      SUM(COALESCE(t.quantity,0))::text AS quantity,
      SUM(COALESCE(t.cost,0) * COALESCE(t.fx_rate_to_base,1))::text AS cost_aud,
      (ARRAY_AGG(COALESCE(t.close_price,t.price) ORDER BY t.trade_date DESC, t.created_at DESC))[1]::text AS last_price,
      MAX(t.trade_date)::text AS as_of_date
    FROM transactions t JOIN instruments i ON i.id=t.instrument_id
    WHERE t.account_id=$1 AND t.type IN ('BUY','SELL')
    GROUP BY i.id
  `, [accountId]);

  await client.query(`DELETE FROM current_positions WHERE account_id=$1`, [accountId]);
  let count = 0;
  for (const row of rows.rows) {
    const quantity = numberValue(row.quantity);
    if (Math.abs(quantity) < 0.00000001) continue;
    const costAud = Math.max(0, numberValue(row.cost_aud));
    await client.query(`
      INSERT INTO current_positions (
        portfolio_id, account_id, instrument_id, source, quantity, last_price, average_cost_aud,
        cost_aud, market_value_aud, day_gain_aud, pnl_aud, pnl_percent, valuation_basis, as_of_date, updated_at
      ) VALUES ($1,$2,$3,'IBKR Flex',$4,$5,$6,$7,$7,0,0,0,'cost_basis',$8,NOW())
    `, [portfolioId, accountId, row.instrument_id, quantity, row.last_price, quantity ? costAud / quantity : 0, costAud, row.as_of_date]);
    count += 1;
  }
  return count;
}

async function replaceIbkrOpenPositions(client: PoolClient, report: IbkrFlexReport, portfolioId: string, accountId: string) {
  await client.query(`DELETE FROM current_positions WHERE account_id=$1`, [accountId]);
  for (const position of report.openPositions) {
    const instrumentId = await ensureInstrument(client, {
      source: "IBKR", externalKey: position.instrumentKey, name: position.description,
      ticker: position.symbol, exchange: position.exchange, currency: position.currency,
      assetClass: classifyAsset(position.symbol, position.description), conid: position.conid, isin: position.isin,
    });
    await client.query(`
      INSERT INTO current_positions (
        portfolio_id, account_id, instrument_id, source, quantity, last_price, average_cost_aud,
        cost_aud, market_value_aud, day_gain_aud, pnl_aud, pnl_percent, valuation_basis, as_of_date, updated_at
      ) VALUES ($1,$2,$3,'IBKR Open Positions',$4,$5,$6,$7,$8,0,$9,$10,'market',$11,NOW())
    `, [portfolioId, accountId, instrumentId, position.quantity, position.lastPrice, position.averageCostAud,
      position.costAud, position.marketValueAud, position.pnlAud, position.pnlPercent, position.asOfDate]);
  }
  return report.openPositions.length;
}

async function upsertIbkrCash(client: PoolClient, report: IbkrFlexReport, portfolioId: string) {
  if (!report.cash) return;
  await client.query(`
    INSERT INTO cash_accounts (portfolio_id,institution,name,currency,balance,fx_rate_to_aud,balance_aud,as_of_date,is_active,updated_at)
    VALUES ($1,'IBKR','IBKR Cash','AUD',$2,1,$3,$4,true,NOW())
    ON CONFLICT (portfolio_id,institution,name) DO UPDATE SET currency='AUD',balance=EXCLUDED.balance,
      fx_rate_to_aud=1,balance_aud=EXCLUDED.balance_aud,as_of_date=EXCLUDED.as_of_date,is_active=true,updated_at=NOW()
  `, [portfolioId, report.cash.balance, report.cash.balanceAud, report.cash.asOfDate]);
}

function syncRunFromRow(row: Record<string, unknown>): SyncRun {
  return {
    id: String(row.id),
    source: String(row.source),
    ownerType: row.owner_type == null ? null : row.owner_type as OwnerType,
    trigger: row.trigger as SyncRun["trigger"],
    status: row.status as SyncRun["status"],
    startedAt: new Date(String(row.started_at)).toISOString(),
    finishedAt: new Date(String(row.finished_at)).toISOString(),
    durationMs: row.duration_ms == null ? null : numberValue(row.duration_ms),
    recordCount: row.record_count == null ? null : numberValue(row.record_count),
    positionCount: row.position_count == null ? null : numberValue(row.position_count),
    cashAud: row.cash_aud == null ? null : numberValue(row.cash_aud),
    message: row.message == null ? null : String(row.message),
    error: row.error == null ? null : String(row.error),
  };
}

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
      await upsertIbkrCash(client, report, portfolioId);
      await client.query(`INSERT INTO import_runs (portfolio_id, account_id, source, record_count) VALUES ($1,$2,'IBKR',$3)`, [portfolioId, accountId, report.transactions.length]);
      await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
      return { source: "IBKR", ownerType, accountKey: maskAccount(accountKey), imported, duplicates, positions: positionCount, openPositions: report.openPositions.length, cashAud: report.cash?.balanceAud, valuationSource: report.openPositions.length ? "open_positions" : "trade_cost_basis", storageMode: "postgresql" };
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
        const instrumentId = await ensureInstrument(client, {
          source: "Directshares", externalKey: `${position.symbol}:${position.exchange}`, name: position.symbol,
          ticker: position.symbol, exchange: position.exchange, currency: position.currency,
          assetClass: classifyAsset(position.symbol, position.symbol),
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
          currency: transaction.currency,
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

  async listCashAccounts(ownerType?: OwnerType): Promise<CashAccount[]> {
    const values: unknown[] = [];
    const filter = ownerType ? "WHERE p.legal_owner_type=$1 AND c.is_active=true" : "WHERE c.is_active=true";
    if (ownerType) values.push(ownerType);
    const result = await getPool().query(`
      SELECT c.id, p.legal_owner_type, c.institution, c.name, c.currency, c.balance, c.balance_aud,
        c.fx_rate_to_aud, c.as_of_date::text, c.updated_at::text
      FROM cash_accounts c JOIN portfolios p ON p.id=c.portfolio_id
      ${filter} ORDER BY c.institution, c.name
    `, values);
    return result.rows.map(row => ({ id: row.id, ownerType: row.legal_owner_type, institution: row.institution,
      name: row.name, currency: row.currency, balance: numberValue(row.balance), balanceAud: numberValue(row.balance_aud),
      fxRateToAud: numberValue(row.fx_rate_to_aud), asOfDate: row.as_of_date, updatedAt: row.updated_at }));
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
      const pnlAud = marketValueAud - totalCostAud;
      const dealerSpreadAudPerKg = Math.max(0, retailAudPerKg - buybackAudPerKg);
      return { id: row.id, ownerType: row.legal_owner_type, assetType: row.asset_type, name: row.name,
        quantityKg, totalCostAud, costAudPerKg: quantityKg ? totalCostAud / quantityKg : 0,
        buybackAudPerKg, retailAudPerKg, marketValueAud, pnlAud,
        pnlPercent: totalCostAud ? pnlAud / totalCostAud * 100 : 0,
        dealerSpreadAudPerKg, dealerSpreadPercent: retailAudPerKg ? dealerSpreadAudPerKg / retailAudPerKg * 100 : 0,
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
            UPDATE manual_assets SET asset_type='PLATINUM',name=$1,quantity_kg=$2,quantity_troy_oz=$3,
              total_cost_aud=$4,buyback_aud_per_kg=$5,retail_aud_per_kg=$6,current_price_aud_per_oz=$7,
              market_value_aud=$8,price_provider=$9,price_source_url=$10,price_retrieved_at=$11,
              purchase_date=$12,as_of_date=$13,updated_at=NOW()
            WHERE id=$14 AND portfolio_id=$15 RETURNING id,updated_at::text
          `, [input.name, input.quantityKg, quantityTroyOz, input.totalCostAud, input.buybackAudPerKg,
            input.retailAudPerKg, currentPriceAudPerOz, marketValueAud, input.priceProvider,
            input.priceSourceUrl, input.priceRetrievedAt, input.purchaseDate, input.asOfDate, input.id, portfolioId])
        : await client.query(`
            INSERT INTO manual_assets (portfolio_id,asset_type,name,quantity_kg,quantity_troy_oz,total_cost_aud,
              buyback_aud_per_kg,retail_aud_per_kg,current_price_aud_per_oz,market_value_aud,price_provider,
              price_source_url,price_retrieved_at,purchase_date,as_of_date,updated_at)
            VALUES ($1,'PLATINUM',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
            RETURNING id,updated_at::text
          `, [portfolioId, input.name, input.quantityKg, quantityTroyOz, input.totalCostAud,
            input.buybackAudPerKg, input.retailAudPerKg, currentPriceAudPerOz, marketValueAud,
            input.priceProvider, input.priceSourceUrl, input.priceRetrievedAt, input.purchaseDate, input.asOfDate]);
      if (!result.rows[0]) throw new Error("Physical platinum position was not found.");
      await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
      const pnlAud = marketValueAud - input.totalCostAud;
      const spread = Math.max(0, input.retailAudPerKg - input.buybackAudPerKg);
      return { id: result.rows[0].id, ownerType: input.ownerType, assetType: "PLATINUM", name: input.name,
        quantityKg: input.quantityKg, totalCostAud: input.totalCostAud,
        costAudPerKg: input.quantityKg ? input.totalCostAud / input.quantityKg : 0,
        buybackAudPerKg: input.buybackAudPerKg, retailAudPerKg: input.retailAudPerKg,
        marketValueAud, pnlAud, pnlPercent: input.totalCostAud ? pnlAud / input.totalCostAud * 100 : 0,
        dealerSpreadAudPerKg: spread, dealerSpreadPercent: input.retailAudPerKg ? spread / input.retailAudPerKg * 100 : 0,
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
    const safeLimit = Math.max(1, Math.min(2000, limit));
    const [instrumentRows, priceRows, fxRows] = await Promise.all([
      getPool().query<{
        ticker: string; exchange: string; name: string; currency: string; asset_class: string;
        position_count: string; quantity: string; market_value_aud: string; last_price: string | null; as_of_date: string | null;
      }>(`
        SELECT i.ticker,i.exchange,(ARRAY_AGG(i.name ORDER BY cp.market_value_aud DESC))[1] AS name,
          i.currency,i.asset_class,COUNT(cp.id)::text AS position_count,SUM(cp.quantity)::text AS quantity,
          SUM(cp.market_value_aud)::text AS market_value_aud,
          (ARRAY_AGG(cp.last_price ORDER BY cp.as_of_date DESC,cp.updated_at DESC))[1]::text AS last_price,
          MAX(cp.as_of_date)::text AS as_of_date
        FROM current_positions cp
        JOIN instruments i ON i.id=cp.instrument_id
        GROUP BY i.ticker,i.exchange,i.currency,i.asset_class
        ORDER BY SUM(cp.market_value_aud) DESC
      `),
      getPool().query<{
        id: string; instrument_id: string; ticker: string; exchange: string; name: string; currency: string;
        close: string; price_date: string; source: string; retrieved_at: string;
      }>(`
        SELECT dp.id,dp.instrument_id,i.ticker,i.exchange,i.name,dp.currency,dp.close::text,
          dp.price_date::text,dp.source,dp.retrieved_at::text
        FROM daily_prices dp
        JOIN instruments i ON i.id=dp.instrument_id
        ORDER BY dp.price_date DESC,dp.retrieved_at DESC
        LIMIT $1
      `, [safeLimit]),
      getPool().query<{ id: string; currency: string; rate_to_aud: string; rate_date: string; source: string; retrieved_at: string }>(`
        SELECT id,currency,rate_to_aud::text,rate_date::text,source,retrieved_at::text
        FROM fx_rates
        ORDER BY rate_date DESC,retrieved_at DESC
        LIMIT $1
      `, [safeLimit]),
    ]);

    return {
      instruments: instrumentRows.rows.map(row => ({
        symbol: row.ticker,
        exchange: row.exchange,
        name: row.name,
        currency: row.currency,
        assetClass: row.asset_class,
        positionCount: numberValue(row.position_count),
        quantity: numberValue(row.quantity),
        marketValueAud: numberValue(row.market_value_aud),
        lastPrice: row.last_price == null ? null : numberValue(row.last_price),
        asOfDate: row.as_of_date,
      })),
      prices: priceRows.rows.map(row => ({
        id: row.id,
        instrumentId: row.instrument_id,
        symbol: row.ticker,
        exchange: row.exchange,
        name: row.name,
        currency: row.currency,
        close: numberValue(row.close),
        priceDate: row.price_date,
        source: row.source,
        retrievedAt: new Date(row.retrieved_at).toISOString(),
      })),
      fxRates: fxRows.rows.map(row => ({
        id: row.id,
        currency: row.currency,
        rateToAud: numberValue(row.rate_to_aud),
        rateDate: row.rate_date,
        source: row.source,
        retrievedAt: new Date(row.retrieved_at).toISOString(),
      })),
    };
  }

  async recordDailyPrices(prices: DailyPriceInput[], fxRates: FxRateInput[] = []): Promise<PriceImportResult> {
    const result: PriceImportResult = {
      imported: 0,
      matchedInstruments: 0,
      updatedPositions: 0,
      updatedCashAccounts: 0,
      fxRates: 0,
      skipped: 0,
      errors: [],
      storageMode: "postgresql",
    };
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const touchedPortfolios = new Set<string>();
      const rateInputs = [
        ...fxRates,
        ...prices.filter(price => price.fxRateToAud).map(price => ({
          currency: price.currency,
          rateToAud: price.fxRateToAud!,
          rateDate: price.priceDate,
          source: price.source || "Manual",
        })),
      ];

      for (const input of rateInputs) {
        const currency = normaliseCurrency(input.currency);
        if (currency === "AUD") continue;
        await client.query(`
          INSERT INTO fx_rates (currency,rate_to_aud,rate_date,source,retrieved_at)
          VALUES ($1,$2,$3,$4,NOW())
          ON CONFLICT (currency,rate_date,source)
          DO UPDATE SET rate_to_aud=EXCLUDED.rate_to_aud,retrieved_at=NOW()
        `, [currency, input.rateToAud, input.rateDate, input.source.trim() || "Manual"]);
        result.fxRates += 1;
        const cashRows = await client.query<{ portfolio_id: string }>(`
          UPDATE cash_accounts
          SET fx_rate_to_aud=$1,balance_aud=ROUND((balance*$1)::numeric,2),as_of_date=$2,updated_at=NOW()
          WHERE currency=$3 AND is_active=true
          RETURNING portfolio_id
        `, [input.rateToAud, input.rateDate, currency]);
        result.updatedCashAccounts += cashRows.rowCount ?? 0;
        for (const row of cashRows.rows) touchedPortfolios.add(row.portfolio_id);
      }

      for (const input of prices) {
        const symbol = normaliseSymbol(input.symbol);
        const exchange = input.exchange?.trim().toUpperCase() ?? "";
        const currency = normaliseCurrency(input.currency);
        const instruments = await client.query<{ id: string; ticker: string; exchange: string; name: string; currency: string }>(`
          SELECT id,ticker,exchange,name,currency
          FROM instruments
          WHERE UPPER(ticker)=UPPER($1)
            AND ($2 = '' OR UPPER(exchange)=UPPER($2))
          ORDER BY exchange,name
        `, [symbol, exchange]);
        if (!instruments.rows.length) {
          result.skipped += 1;
          result.errors.push(`${symbol}${exchange ? `:${exchange}` : ""} has no known instrument to price.`);
          continue;
        }
        result.matchedInstruments += instruments.rows.length;
        const rateToAud = currency === "AUD" ? 1 : input.fxRateToAud ?? await latestFxRate(client, currency, input.priceDate);

        for (const instrument of instruments.rows) {
          if (normaliseCurrency(instrument.currency) !== currency) {
            result.skipped += 1;
            result.errors.push(`${instrument.ticker}:${instrument.exchange} expects ${instrument.currency}, not ${currency}.`);
            continue;
          }
          const previousPrice = await client.query<{ close: string }>(`
            SELECT close::text
            FROM daily_prices
            WHERE instrument_id=$1 AND price_date < $2
            ORDER BY price_date DESC,retrieved_at DESC
            LIMIT 1
          `, [instrument.id, input.priceDate]);
          const previousClose = previousPrice.rows[0]?.close ?? null;
          await client.query(`
            INSERT INTO daily_prices (instrument_id,price_date,close,currency,source,retrieved_at)
            VALUES ($1,$2,$3,$4,$5,NOW())
            ON CONFLICT (instrument_id,price_date)
            DO UPDATE SET close=EXCLUDED.close,currency=EXCLUDED.currency,source=EXCLUDED.source,retrieved_at=NOW()
          `, [instrument.id, input.priceDate, input.close, currency, input.source.trim() || "Manual"]);
          result.imported += 1;

          if (!rateToAud) {
            result.skipped += 1;
            result.errors.push(`${instrument.ticker}:${instrument.exchange} was stored but not applied because ${currency}/AUD FX is missing.`);
            continue;
          }

          const updated = await client.query<{ portfolio_id: string }>(`
            UPDATE current_positions
            SET last_price=$2,
              market_value_aud=ROUND((quantity*$2*$3)::numeric,2),
              day_gain_aud=CASE
                WHEN $5::numeric IS NULL THEN ROUND(((quantity*$2*$3)-market_value_aud)::numeric,2)
                ELSE ROUND((quantity*($2-$5::numeric)*$3)::numeric,2)
              END,
              pnl_aud=ROUND(((quantity*$2*$3)-cost_aud)::numeric,2),
              pnl_percent=CASE WHEN cost_aud <> 0 THEN (((quantity*$2*$3)-cost_aud)/cost_aud*100) ELSE 0 END,
              valuation_basis='market',
              as_of_date=$4,
              updated_at=NOW()
            WHERE instrument_id=$1
            RETURNING portfolio_id
          `, [instrument.id, input.close, rateToAud, input.priceDate, previousClose]);
          result.updatedPositions += updated.rowCount ?? 0;
          for (const row of updated.rows) touchedPortfolios.add(row.portfolio_id);
        }
      }

      for (const portfolioId of touchedPortfolios) await captureSnapshot(client, portfolioId);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async getLatestPlatinumPrice(): Promise<PlatinumPrice | null> {
    const result = await getPool().query(`
      SELECT provider,product_key,product_name,retail_aud_per_kg,buyback_aud_per_kg,
        source_url,price_date::text,retrieved_at
      FROM platinum_prices ORDER BY retrieved_at DESC LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return null;
    const retailAudPerKg = numberValue(row.retail_aud_per_kg);
    const buybackAudPerKg = numberValue(row.buyback_aud_per_kg);
    const spreadAudPerKg = Math.max(0, retailAudPerKg - buybackAudPerKg);
    return { provider: row.provider, productKey: row.product_key, productName: row.product_name,
      retailAudPerKg, buybackAudPerKg, spreadAudPerKg,
      spreadPercentOfRetail: retailAudPerKg ? spreadAudPerKg / retailAudPerKg * 100 : 0,
      sourceUrl: row.source_url, priceDate: row.price_date,
      retrievedAt: new Date(row.retrieved_at).toISOString() } as PlatinumPrice;
  }

  async recordPlatinumPrice(price: PlatinumPrice): Promise<PlatinumPrice> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO platinum_prices (provider,product_key,product_name,retail_aud_per_kg,buyback_aud_per_kg,source_url,price_date,retrieved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (provider,product_key,price_date) DO UPDATE SET product_name=EXCLUDED.product_name,
          retail_aud_per_kg=EXCLUDED.retail_aud_per_kg,buyback_aud_per_kg=EXCLUDED.buyback_aud_per_kg,
          source_url=EXCLUDED.source_url,retrieved_at=EXCLUDED.retrieved_at
      `, [price.provider, price.productKey, price.productName, price.retailAudPerKg,
        price.buybackAudPerKg, price.sourceUrl, price.priceDate, price.retrievedAt]);
      await client.query(`
        UPDATE manual_assets SET buyback_aud_per_kg=$1,retail_aud_per_kg=$2,
          current_price_aud_per_oz=$1/32.1507465686,market_value_aud=quantity_kg*$1,
          price_provider=$3,price_source_url=$4,price_retrieved_at=$5,as_of_date=$6,updated_at=NOW()
        WHERE asset_type='PLATINUM'
      `, [price.buybackAudPerKg, price.retailAudPerKg, price.provider, price.sourceUrl,
        price.retrievedAt, price.priceDate]);
      const portfolios = await client.query<{ portfolio_id: string }>(`SELECT DISTINCT portfolio_id FROM manual_assets WHERE asset_type='PLATINUM'`);
      for (const row of portfolios.rows) await captureSnapshot(client, row.portfolio_id);
      await client.query("COMMIT");
      return price;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
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
    for (const asset of manualAssets) positions.push({
      id: asset.id, ownerType: asset.ownerType, broker: "Physical", accountKey: `${asset.ownerType}-PHYSICAL`,
      instrumentKey: `manual:${asset.id}`, symbol: "PLATINUM", name: asset.name, exchange: "PHYSICAL",
      currency: "AUD", assetClass: "Physical platinum", quantity: asset.quantityKg,
      lastPrice: asset.buybackAudPerKg, averageCostAud: asset.costAudPerKg,
      costAud: asset.totalCostAud, marketValueAud: asset.marketValueAud, dayGainAud: 0,
      pnlAud: asset.pnlAud, pnlPercent: asset.pnlPercent, valuationBasis: "market",
      asOfDate: asset.asOfDate, source: "Manual physical",
    });

    const cashAccounts = await this.listCashAccounts(ownerType);
    const investedValue = positions.reduce((sum, position) => sum + position.marketValueAud, 0);
    const cashValue = cashAccounts.reduce((sum, account) => sum + account.balanceAud, 0);
    const totalValue = investedValue + cashValue;
    const dailyMovement = positions.reduce((sum, position) => sum + position.dayGainAud, 0);
    const unrealised = positions.reduce((sum, position) => sum + position.pnlAud, 0);
    const realisedResult = await getPool().query(`
      SELECT COALESCE(SUM(COALESCE(t.realised_pnl,0)*COALESCE(t.fx_rate_to_base,1)),0)::text AS realised
      FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id WHERE t.type='SELL' ${ownerFilter}
    `, values);
    const totalReturn = unrealised + numberValue(realisedResult.rows[0]?.realised);
    const totalCost = positions.reduce((sum, position) => sum + position.costAud, 0);
    const provisionalValue = positions.filter(position => position.valuationBasis === "cost_basis").reduce((sum, position) => sum + position.marketValueAud, 0);
    const currentValue = positions.filter(position => position.valuationBasis === "market").reduce((sum, position) => sum + position.marketValueAud, 0) + cashValue;
    const holdings = [...positions].sort((a,b)=>b.marketValueAud-a.marketValueAud).map(position => ({ ...position, weight: totalValue ? position.marketValueAud/totalValue*100 : 0 }));
    const allocationMap = new Map<string,number>();
    for (const position of positions) allocationMap.set(position.assetClass,(allocationMap.get(position.assetClass)??0)+position.marketValueAud);
    if (cashValue) allocationMap.set("Cash",cashValue);
    const allocations=[...allocationMap.entries()].map(([name,amount])=>({name,amount,value:totalValue?amount/totalValue*100:0})).sort((a,b)=>b.amount-a.amount);
    const currencyExposure = buildCurrencyExposure(positions, cashAccounts, totalValue);

    const snapshotRows = await getPool().query(`
      SELECT ps.captured_at::date::text AS day,p.legal_owner_type,
        (ARRAY_AGG((ps.market_value+ps.cash_value) ORDER BY ps.captured_at DESC))[1]::text AS value
      FROM portfolio_snapshots ps JOIN portfolios p ON p.id=ps.portfolio_id
      WHERE 1=1 ${ownerFilter} GROUP BY ps.captured_at::date,p.legal_owner_type ORDER BY day DESC LIMIT 2000
    `, values);
    const dayMap=new Map<string,{personal?:number;smsf?:number}>();
    for(const row of snapshotRows.rows){const entry=dayMap.get(row.day)??{};if(row.legal_owner_type==="PERSONAL")entry.personal=numberValue(row.value);else entry.smsf=numberValue(row.value);dayMap.set(row.day,entry)}
    const performance=[...dayMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([day,item])=>({date:day,personal:item.personal,smsf:item.smsf,overall:item.personal!==undefined||item.smsf!==undefined?(item.personal??0)+(item.smsf??0):undefined}));
    const navSeries: NavPoint[] = [...dayMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,item]) => {
      const value = ownerType === "PERSONAL" ? item.personal : ownerType === "SMSF" ? item.smsf : (item.personal ?? 0) + (item.smsf ?? 0);
      return { date, value: value ?? 0 };
    });
    const periodReturns = buildPeriodReturns(navSeries);

    const importRows=await getPool().query(`
      SELECT ir.source,ir.record_count,ir.imported_at::text,p.legal_owner_type,ba.external_account_id
      FROM import_runs ir JOIN portfolios p ON p.id=ir.portfolio_id JOIN broker_accounts ba ON ba.id=ir.account_id
      WHERE ir.id IN (SELECT DISTINCT ON (account_id,source) id FROM import_runs ORDER BY account_id,source,imported_at DESC)
      ${ownerType?"AND p.legal_owner_type=$1":""}
    `,values);
    const accounts=importRows.rows.map(row=>({name:`${row.source} ${row.legal_owner_type==="SMSF"?"SMSF":"Personal"}`,detail:maskAccount(row.external_account_id),status:`${row.record_count} records`,ownerType:row.legal_owner_type as OwnerType}));
    for(const account of cashAccounts)accounts.push({name:`${account.institution} · ${account.name}`,detail:`${account.currency} ${account.balance.toLocaleString("en-AU",{maximumFractionDigits:2})}`,status:"Cash current",ownerType:account.ownerType});
    for (const owner of ["PERSONAL", "SMSF"] as const) {
      const assets = manualAssets.filter(asset => asset.ownerType === owner);
      if (assets.length) accounts.push({name:`Physical platinum ${owner==="SMSF"?"SMSF":"Personal"}`,detail:`${assets.reduce((sum,asset)=>sum+asset.quantityKg,0).toLocaleString("en-AU",{maximumFractionDigits:4})} kg`,status:`${assets.length} position${assets.length===1?"":"s"}`,ownerType:owner});
    }
    const updated=[...importRows.rows.map(row=>row.imported_at),...cashAccounts.map(account=>account.updatedAt),...manualAssets.map(asset=>asset.updatedAt)].sort();
    const syncRuns = await this.listSyncRuns(8, ownerType);
    const allocationTargets = await this.listAllocationTargets();
    const freshness = buildValuationFreshness({ positions, cashAccounts, manualAssets, syncRuns });
    const transactions = await this.listTransactions(ownerType);
    const xirr = buildXirrSummary({
      scope,
      positions,
      cashAccounts,
      transactions,
      asOfDate: updated.at(-1) ?? null,
    });
    const income = buildIncomeSummary(transactions, totalValue);

    return {scope,storageMode:"postgresql",totalValue,investedValue,cashValue,dailyMovement,totalReturn,totalReturnPercent:totalCost?totalReturn/totalCost*100:0,holdings,allocations,performance,periodReturns,xirr,income,allocationTargets,currencyExposure,accounts,syncRuns,freshness,provisionalValue,currentValue,lastUpdated:updated.at(-1)??null};
  }
}

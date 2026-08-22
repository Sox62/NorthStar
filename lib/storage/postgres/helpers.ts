import type { PoolClient } from "pg";
import type { IbkrFlexReport, ImportedTransaction } from "@/lib/integrations/types";
import { maskAccount, numberValue } from "@/lib/core/accounting";
import { classifyAsset } from "../classify";
import { resolveIbkrCurrentPositions } from "../ibkr-positions";
import type { FundamentalResearchDraft, MinerFundamentals, OwnerType, StructuralLevel, SyncRun } from "../types";

export const optionalNumber = (value: unknown) => value == null ? undefined : Number(value);

export async function ensurePortfolio(client: PoolClient, ownerType: OwnerType) {
  // Preserve existing installations while correcting the displayed product name.
  const previousProductName = ["North", "Star"].join(" ");
  await client.query(`
    UPDATE portfolio_groups
    SET name = 'SouthernStar'
    WHERE name = $1
      AND NOT EXISTS (SELECT 1 FROM portfolio_groups WHERE name = 'SouthernStar')
  `, [previousProductName]);
  const group = await client.query<{ id: string }>(`
    INSERT INTO portfolio_groups (name, base_currency)
    VALUES ('SouthernStar', 'AUD')
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

export async function ensureBrokerAccount(client: PoolClient, portfolioId: string, broker: string, accountKey: string, currency = "AUD") {
  const result = await client.query<{ id: string }>(`
    INSERT INTO broker_accounts (portfolio_id, broker, external_account_id, currency, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (portfolio_id, broker, external_account_id)
    DO UPDATE SET currency = EXCLUDED.currency, updated_at = NOW()
    RETURNING id
  `, [portfolioId, broker, accountKey, currency]);
  return result.rows[0].id;
}

export async function ensureInstrument(client: PoolClient, input: {
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

export function transactionInstrumentCurrency(transaction: ImportedTransaction) {
  const rawCurrency = transaction.raw?.tradeCurrency;
  return typeof rawCurrency === "string" && /^[A-Z]{3}$/i.test(rawCurrency.trim())
    ? rawCurrency.trim().toUpperCase()
    : transaction.currency;
}


export async function replaceIbkrNavSnapshots(client: PoolClient, report: IbkrFlexReport, portfolioId: string) {
  if (!report.navSnapshots.length) return;
  const days = report.navSnapshots.map((snapshot) => snapshot.date);
  await client.query(`DELETE FROM portfolio_snapshots WHERE portfolio_id=$1 AND captured_at::date = ANY($2::date[])`, [portfolioId, days]);
  for (const snapshot of report.navSnapshots) {
    await client.query(`
      INSERT INTO portfolio_snapshots (portfolio_id, captured_at, market_value, cash_value, net_contributions)
      VALUES ($1, $2::timestamptz, $3, $4, 0)
    `, [portfolioId, `${snapshot.date}T12:00:00.000Z`, snapshot.stockValueAud, snapshot.cashValueAud]);
  }
}

export async function captureSnapshot(client: PoolClient, portfolioId: string) {
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

export async function rebuildIbkrPositions(client: PoolClient, portfolioId: string, accountId: string) {
  const rows = await client.query<{
    instrument_id: string; quantity: string; cost_aud: string; last_price: string | null; as_of_date: string;
  }>(`
    SELECT i.id AS instrument_id,
      SUM(CASE WHEN t.type='SELL' THEN -ABS(COALESCE(t.quantity,0)) ELSE ABS(COALESCE(t.quantity,0)) END)::text AS quantity,
      SUM(CASE WHEN t.type='SELL' THEN -ABS(COALESCE(t.cost,0) * COALESCE(t.fx_rate_to_base,1)) ELSE ABS(COALESCE(t.cost,0) * COALESCE(t.fx_rate_to_base,1)) END)::text AS cost_aud,
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

export async function replaceIbkrOpenPositions(client: PoolClient, report: IbkrFlexReport, portfolioId: string, accountId: string) {
  await client.query(`DELETE FROM current_positions WHERE account_id=$1`, [accountId]);
  const positions = resolveIbkrCurrentPositions(report);
  for (const position of positions) {
    const instrumentId = await ensureInstrument(client, {
      source: "IBKR", externalKey: position.instrumentKey, name: position.description,
      ticker: position.symbol, exchange: position.exchange, currency: position.currency,
      assetClass: classifyAsset(position.symbol, position.description), conid: position.conid, isin: position.isin,
    });
    await client.query(`
      INSERT INTO current_positions (
        portfolio_id, account_id, instrument_id, source, quantity, last_price, average_cost_aud,
        cost_aud, market_value_aud, day_gain_aud, pnl_aud, pnl_percent, valuation_basis, as_of_date, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,NOW())
    `, [portfolioId, accountId, instrumentId, position.source, position.quantity, position.lastPrice, position.averageCostAud,
      position.costAud, position.marketValueAud, position.pnlAud, position.pnlPercent, position.valuationBasis, position.asOfDate]);
  }
  return positions.length;
}


export async function replaceIbkrOpenOrders(client: PoolClient, report: IbkrFlexReport, portfolioId: string, accountId: string) {
  await client.query(`DELETE FROM ibkr_open_orders WHERE account_id=$1 AND source='IBKR Flex'`, [accountId]);
  const asOfDate = report.toDate || new Date().toISOString().slice(0, 10);
  for (const order of report.openOrders) {
    await client.query(`
      INSERT INTO ibkr_open_orders (
        portfolio_id,account_id,order_id,conid,symbol,name,exchange,currency,side,status,order_type,time_in_force,
        total_quantity,filled_quantity,remaining_quantity,limit_price,stop_price,average_price,description,source,raw,as_of_date,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'IBKR Flex',$20,$21,$22::timestamptz,NOW())
      ON CONFLICT (account_id, order_id, source) DO UPDATE SET
        conid=EXCLUDED.conid,symbol=EXCLUDED.symbol,name=EXCLUDED.name,exchange=EXCLUDED.exchange,currency=EXCLUDED.currency,
        side=EXCLUDED.side,status=EXCLUDED.status,order_type=EXCLUDED.order_type,time_in_force=EXCLUDED.time_in_force,
        total_quantity=EXCLUDED.total_quantity,filled_quantity=EXCLUDED.filled_quantity,remaining_quantity=EXCLUDED.remaining_quantity,
        limit_price=EXCLUDED.limit_price,stop_price=EXCLUDED.stop_price,average_price=EXCLUDED.average_price,description=EXCLUDED.description,
        raw=EXCLUDED.raw,as_of_date=EXCLUDED.as_of_date,created_at=EXCLUDED.created_at,updated_at=NOW()
    `, [portfolioId, accountId, order.orderId, order.conid ?? null, order.symbol, order.description || order.symbol, order.exchange, order.currency,
      order.side, order.status, order.orderType, order.timeInForce, order.totalQuantity, order.filledQuantity, order.remainingQuantity,
      order.limitPrice, order.stopPrice, order.averagePrice, order.description, order.raw ? JSON.stringify(order.raw) : null, asOfDate, order.createdAt]);
  }
  return report.openOrders.length;
}

function ibkrCashAccountName(report: IbkrFlexReport, cash: NonNullable<IbkrFlexReport["cash"]>, kind: "total" | "component") {
  const account = cash.externalAccountId || report.accountId;
  const accountPart = account && account !== "IBKR" ? ` · ${maskAccount(account)}` : "";
  return kind === "total"
    ? `IBKR Cash${accountPart} · Total AUD`
    : `IBKR Cash${accountPart} · ${cash.currency}`;
}

async function writeIbkrCashAccount(client: PoolClient, portfolioId: string, name: string, cash: NonNullable<IbkrFlexReport["cash"]>, isActive: boolean) {
  await client.query(`
    INSERT INTO cash_accounts (portfolio_id,institution,name,currency,balance,fx_rate_to_aud,balance_aud,as_of_date,is_active,updated_at)
    VALUES ($1,'IBKR',$2,$3,$4,$5,$6,$7,$8,NOW())
    ON CONFLICT (portfolio_id,institution,name) DO UPDATE SET currency=EXCLUDED.currency,balance=EXCLUDED.balance,
      fx_rate_to_aud=EXCLUDED.fx_rate_to_aud,balance_aud=EXCLUDED.balance_aud,as_of_date=EXCLUDED.as_of_date,is_active=EXCLUDED.is_active,updated_at=NOW()
  `, [portfolioId, name, cash.currency, cash.balance, cash.fxRateToAud, cash.balanceAud, cash.asOfDate, isActive]);
}

export function ibkrTotalCashFromComponents(report: IbkrFlexReport): IbkrFlexReport["cash"] {
  if (report.cash) return report.cash;
  if (!report.cashBalances.length) return null;
  return report.cashBalances.reduce<NonNullable<IbkrFlexReport["cash"]>>((sum, cash) => ({
    externalAccountId: cash.externalAccountId,
    currency: "AUD",
    balance: sum.balance + cash.balanceAud,
    balanceAud: sum.balanceAud + cash.balanceAud,
    settledBalance: sum.settledBalance + cash.settledBalanceAud,
    settledBalanceAud: sum.settledBalanceAud + cash.settledBalanceAud,
    fxRateToAud: 1,
    asOfDate: cash.asOfDate,
    raw: { derivedFrom: "cashBalances" },
  }), {
    externalAccountId: report.cashBalances[0]?.externalAccountId ?? report.accountId,
    currency: "AUD",
    balance: 0,
    balanceAud: 0,
    settledBalance: 0,
    settledBalanceAud: 0,
    fxRateToAud: 1,
    asOfDate: report.cashBalances[0]?.asOfDate ?? report.toDate,
  });
}

export async function upsertIbkrCash(client: PoolClient, report: IbkrFlexReport, portfolioId: string) {
  const total = ibkrTotalCashFromComponents(report);
  const components = report.cashBalances;
  if (!total && !components.length) return;
  await client.query(`UPDATE cash_accounts SET is_active=false,updated_at=NOW() WHERE portfolio_id=$1 AND institution='IBKR'`, [portfolioId]);
  if (total) await writeIbkrCashAccount(client, portfolioId, ibkrCashAccountName(report, total, "total"), total, true);
  else if (components.length === 1) await writeIbkrCashAccount(client, portfolioId, ibkrCashAccountName(report, components[0]!, "component"), components[0]!, true);
  for (const cash of components) {
    await writeIbkrCashAccount(client, portfolioId, ibkrCashAccountName(report, cash, "component"), cash, false);
  }
}

export function structuralLevelFromRow(row: Record<string, unknown>): StructuralLevel {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    comparisonSymbol: String(row.comparison_symbol),
    label: String(row.label),
    timeframe: String(row.timeframe) as StructuralLevel["timeframe"],
    direction: String(row.direction) as StructuralLevel["direction"],
    level: numberValue(row.level),
    status: String(row.status) as StructuralLevel["status"],
    source: row.source == null ? null : String(row.source),
    notes: row.notes == null ? null : String(row.notes),
    asOfDate: row.as_of_date == null ? null : String(row.as_of_date),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function minerFundamentalsFromRow(row: Record<string, unknown>): MinerFundamentals {
  return {
    symbol: String(row.symbol),
    name: row.name == null ? null : String(row.name),
    primaryMetal: row.primary_metal == null ? null : String(row.primary_metal),
    jurisdiction: row.jurisdiction == null ? null : String(row.jurisdiction),
    projectStage: row.project_stage == null ? null : String(row.project_stage),
    productionOz: row.production_oz == null ? null : numberValue(row.production_oz),
    aiscUsdPerOz: row.aisc_usd_per_oz == null ? null : numberValue(row.aisc_usd_per_oz),
    resourceMoz: row.resource_moz == null ? null : numberValue(row.resource_moz),
    reserveMoz: row.reserve_moz == null ? null : numberValue(row.reserve_moz),
    cashAud: row.cash_aud == null ? null : numberValue(row.cash_aud),
    debtAud: row.debt_aud == null ? null : numberValue(row.debt_aud),
    marketCapAud: row.market_cap_aud == null ? null : numberValue(row.market_cap_aud),
    npvAud: row.npv_aud == null ? null : numberValue(row.npv_aud),
    capexAud: row.capex_aud == null ? null : numberValue(row.capex_aud),
    irrPercent: row.irr_percent == null ? null : numberValue(row.irr_percent),
    jurisdictionScore: row.jurisdiction_score == null ? null : numberValue(row.jurisdiction_score),
    balanceSheetScore: row.balance_sheet_score == null ? null : numberValue(row.balance_sheet_score),
    dilutionScore: row.dilution_score == null ? null : numberValue(row.dilution_score),
    managementScore: row.management_score == null ? null : numberValue(row.management_score),
    notes: row.notes == null ? null : String(row.notes),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    asOfDate: row.as_of_date == null ? null : String(row.as_of_date),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function fundamentalResearchDraftFromRow(row: Record<string, unknown>): FundamentalResearchDraft {
  return {
    ...minerFundamentalsFromRow(row),
    id: String(row.id),
    status: String(row.status) as FundamentalResearchDraft["status"],
    sourceTitle: row.source_title == null ? null : String(row.source_title),
    sourceDate: row.source_date == null ? null : String(row.source_date),
    sourceExcerpt: row.source_excerpt == null ? null : String(row.source_excerpt),
    extractor: String(row.extractor ?? "manual"),
    confidence: row.confidence == null ? null : numberValue(row.confidence),
    reviewNotes: row.review_notes == null ? null : String(row.review_notes),
    createdAt: new Date(String(row.created_at)).toISOString(),
    reviewedAt: row.reviewed_at == null ? null : new Date(String(row.reviewed_at)).toISOString(),
  };
}

export function syncRunFromRow(row: Record<string, unknown>): SyncRun {
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

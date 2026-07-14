import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const portfolioGroups = pgTable("portfolio_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("AUD"),
}, table => [uniqueIndex("portfolio_group_name_uq").on(table.name)]);

export const portfolios = pgTable("portfolios", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id").references(() => portfolioGroups.id),
  name: text("name").notNull(),
  legalOwnerType: text("legal_owner_type").notNull(),
  baseCurrency: text("base_currency").notNull().default("AUD"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("portfolio_owner_type_uq").on(table.legalOwnerType)]);

export const brokerAccounts = pgTable("broker_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  broker: text("broker").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  currency: text("currency").notNull().default("AUD"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("broker_account_external_uq").on(table.portfolioId, table.broker, table.externalAccountId)]);

export const instruments = pgTable("instruments", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: text("source").notNull(),
  externalKey: text("external_key").notNull(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  exchange: text("exchange").notNull(),
  currency: text("currency").notNull(),
  assetClass: text("asset_class").notNull(),
  conid: text("conid"),
  isin: text("isin"),
  providerSymbol: text("provider_symbol"),
}, table => [
  uniqueIndex("instrument_source_external_uq").on(table.source, table.externalKey),
  index("instrument_ticker_idx").on(table.ticker),
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  accountId: uuid("account_id").references(() => brokerAccounts.id).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id),
  type: text("type").notNull(),
  tradeDate: date("trade_date").notNull(),
  settleDate: date("settle_date"),
  quantity: numeric("quantity", { precision: 28, scale: 10 }),
  price: numeric("price", { precision: 28, scale: 10 }),
  closePrice: numeric("close_price", { precision: 28, scale: 10 }),
  cost: numeric("cost", { precision: 28, scale: 10 }),
  currency: text("currency").notNull(),
  fees: numeric("fees", { precision: 28, scale: 10 }).notNull().default("0"),
  taxes: numeric("taxes", { precision: 28, scale: 10 }).notNull().default("0"),
  netCash: numeric("net_cash", { precision: 28, scale: 10 }),
  fxRateToBase: numeric("fx_rate_to_base", { precision: 28, scale: 10 }),
  realisedPnl: numeric("realised_pnl", { precision: 28, scale: 10 }),
  externalId: text("external_id").notNull(),
  source: text("source").notNull(),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("transaction_source_external_uq").on(table.accountId, table.source, table.externalId)]);

export const currentPositions = pgTable("current_positions", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  accountId: uuid("account_id").references(() => brokerAccounts.id).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id).notNull(),
  source: text("source").notNull(),
  quantity: numeric("quantity", { precision: 28, scale: 10 }).notNull(),
  lastPrice: numeric("last_price", { precision: 28, scale: 10 }),
  averageCostAud: numeric("average_cost_aud", { precision: 28, scale: 10 }).notNull().default("0"),
  costAud: numeric("cost_aud", { precision: 28, scale: 2 }).notNull().default("0"),
  marketValueAud: numeric("market_value_aud", { precision: 28, scale: 2 }).notNull().default("0"),
  dayGainAud: numeric("day_gain_aud", { precision: 28, scale: 2 }).notNull().default("0"),
  pnlAud: numeric("pnl_aud", { precision: 28, scale: 2 }).notNull().default("0"),
  pnlPercent: numeric("pnl_percent", { precision: 18, scale: 6 }).notNull().default("0"),
  valuationBasis: text("valuation_basis").notNull().default("market"),
  asOfDate: date("as_of_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("position_account_instrument_source_uq").on(table.accountId, table.instrumentId, table.source)]);

export const cashAccounts = pgTable("cash_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  institution: text("institution").notNull(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("AUD"),
  balance: numeric("balance", { precision: 28, scale: 2 }).notNull().default("0"),
  fxRateToAud: numeric("fx_rate_to_aud", { precision: 28, scale: 10 }).notNull().default("1"),
  balanceAud: numeric("balance_aud", { precision: 28, scale: 2 }).notNull().default("0"),
  asOfDate: date("as_of_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("cash_account_portfolio_name_uq").on(table.portfolioId, table.institution, table.name)]);

export const importRuns = pgTable("import_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  accountId: uuid("account_id").references(() => brokerAccounts.id).notNull(),
  source: text("source").notNull(),
  recordCount: numeric("record_count", { precision: 12, scale: 0 }).notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  marketValue: numeric("market_value", { precision: 28, scale: 2 }).notNull(),
  cashValue: numeric("cash_value", { precision: 28, scale: 2 }).notNull(),
  netContributions: numeric("net_contributions", { precision: 28, scale: 2 }).notNull().default("0"),
}, table => [index("snapshot_portfolio_captured_idx").on(table.portfolioId, table.capturedAt)]);

export const dailyPrices = pgTable("daily_prices", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id).notNull(),
  priceDate: date("price_date").notNull(),
  close: numeric("close", { precision: 28, scale: 10 }).notNull(),
  currency: text("currency").notNull(),
  source: text("source").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("price_instrument_date_uq").on(table.instrumentId, table.priceDate)]);

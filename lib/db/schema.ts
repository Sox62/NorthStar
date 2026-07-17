import {
  boolean,
  date,
  index,
  integer,
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


export const manualAssets = pgTable("manual_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  assetType: text("asset_type").notNull(),
  name: text("name").notNull(),
  // Legacy columns remain for a safe in-place migration from v0.3.1.
  quantityTroyOz: numeric("quantity_troy_oz", { precision: 28, scale: 10 }).notNull(),
  currentPriceAudPerOz: numeric("current_price_aud_per_oz", { precision: 28, scale: 10 }).notNull().default("0"),
  quantityKg: numeric("quantity_kg", { precision: 28, scale: 10 }).notNull().default("0"),
  totalCostAud: numeric("total_cost_aud", { precision: 28, scale: 2 }).notNull().default("0"),
  buybackAudPerKg: numeric("buyback_aud_per_kg", { precision: 28, scale: 10 }).notNull().default("0"),
  retailAudPerKg: numeric("retail_aud_per_kg", { precision: 28, scale: 10 }).notNull().default("0"),
  marketValueAud: numeric("market_value_aud", { precision: 28, scale: 2 }).notNull().default("0"),
  priceProvider: text("price_provider").notNull().default("ABC Bullion"),
  priceSourceUrl: text("price_source_url").notNull().default("https://www.abcbullion.com/sell/platinum"),
  priceRetrievedAt: timestamp("price_retrieved_at", { withTimezone: true }),
  purchaseDate: date("purchase_date").notNull(),
  asOfDate: date("as_of_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("manual_asset_portfolio_idx").on(table.portfolioId)]);

export const platinumPrices = pgTable("platinum_prices", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  productKey: text("product_key").notNull(),
  productName: text("product_name").notNull(),
  retailAudPerKg: numeric("retail_aud_per_kg", { precision: 28, scale: 10 }).notNull(),
  buybackAudPerKg: numeric("buyback_aud_per_kg", { precision: 28, scale: 10 }).notNull(),
  sourceUrl: text("source_url").notNull(),
  priceDate: date("price_date").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("platinum_price_provider_product_date_uq").on(table.provider, table.productKey, table.priceDate)]);

export const importRuns = pgTable("import_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id).notNull(),
  accountId: uuid("account_id").references(() => brokerAccounts.id).notNull(),
  source: text("source").notNull(),
  recordCount: numeric("record_count", { precision: 12, scale: 0 }).notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: text("source").notNull(),
  ownerType: text("owner_type"),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  durationMs: integer("duration_ms"),
  recordCount: integer("record_count"),
  positionCount: integer("position_count"),
  cashAud: numeric("cash_aud", { precision: 28, scale: 2 }),
  message: text("message"),
  error: text("error"),
}, table => [
  index("sync_runs_source_finished_idx").on(table.source, table.finishedAt),
  index("sync_runs_status_finished_idx").on(table.status, table.finishedAt),
]);

export const allocationTargets = pgTable("allocation_targets", {
  sector: text("sector").primaryKey(),
  targetPercent: numeric("target_percent", { precision: 8, scale: 4 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authUsers = pgTable("auth_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull(),
  webauthnUserId: text("webauthn_user_id").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("auth_users_username_uq").on(table.username),
  uniqueIndex("auth_users_webauthn_user_id_uq").on(table.webauthnUserId),
]);

export const authPasskeys = pgTable("auth_passkeys", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").references(() => authUsers.id, { onDelete: "cascade" }).notNull(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: jsonb("transports").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, table => [
  index("auth_passkeys_user_idx").on(table.userId),
]);

export const authChallenges = pgTable("auth_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username"),
  kind: text("kind").notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("auth_challenges_challenge_uq").on(table.challenge),
  index("auth_challenges_lookup_idx").on(table.kind, table.username, table.expiresAt),
]);

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

export const fxRates = pgTable("fx_rates", {
  id: uuid("id").defaultRandom().primaryKey(),
  currency: text("currency").notNull(),
  rateToAud: numeric("rate_to_aud", { precision: 28, scale: 10 }).notNull(),
  rateDate: date("rate_date").notNull(),
  source: text("source").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("fx_rate_currency_date_source_uq").on(table.currency, table.rateDate, table.source),
  index("fx_rate_currency_date_idx").on(table.currency, table.rateDate),
]);

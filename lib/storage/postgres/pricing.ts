import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import type { DailyPriceInput, FxRateInput, PlatinumPrice, PriceBook, PriceImportResult } from "../types";

const numberValue = (value: unknown) => Number(value ?? 0);
const normaliseCurrency = (value: string) => value.trim().toUpperCase();
const normaliseSymbol = (value: string) => value.trim().toUpperCase();

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

export async function listPriceBookPostgres(limit = 80): Promise<PriceBook> {
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

export async function recordDailyPricesPostgres(prices: DailyPriceInput[], fxRates: FxRateInput[] = []): Promise<PriceImportResult> {
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

export async function getLatestPlatinumPricePostgres(): Promise<PlatinumPrice | null> {
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

export async function recordPlatinumPricePostgres(price: PlatinumPrice): Promise<PlatinumPrice> {
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

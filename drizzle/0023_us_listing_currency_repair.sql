UPDATE instruments
SET currency = 'USD'
WHERE UPPER(ticker) IN ('CDE', 'B', 'HL')
  AND UPPER(exchange) IN ('US', 'NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'NYSEARCA', 'NYSEAMERICAN', 'NYSEMKT', 'BATS')
  AND UPPER(currency) = 'AUD';
--> statement-breakpoint
UPDATE daily_prices dp
SET currency = 'USD'
FROM instruments i
WHERE dp.instrument_id = i.id
  AND UPPER(i.ticker) IN ('CDE', 'B', 'HL')
  AND UPPER(i.exchange) IN ('US', 'NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'NYSEARCA', 'NYSEAMERICAN', 'NYSEMKT', 'BATS')
  AND UPPER(dp.currency) = 'AUD';

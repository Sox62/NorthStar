UPDATE instruments
SET currency = 'USD'
WHERE UPPER(exchange) IN ('US','NYSE','NASDAQ','AMEX','ARCA','NYSEARCA','NYSEAMERICAN','NYSEMKT','BATS')
  AND UPPER(currency) = 'AUD';
--> statement-breakpoint
UPDATE instruments
SET currency = 'CAD'
WHERE UPPER(exchange) IN ('TSX','TSE','TSXV','TSX/TSXV','CVE','V','TO','CA','CN')
  AND UPPER(currency) = 'AUD';
--> statement-breakpoint
UPDATE instruments
SET currency = 'GBP'
WHERE UPPER(exchange) IN ('LSE','LON','LN','GB','UK')
  AND UPPER(currency) = 'AUD';
--> statement-breakpoint
UPDATE daily_prices dp
SET currency = i.currency
FROM instruments i
WHERE dp.instrument_id = i.id
  AND UPPER(dp.currency) = 'AUD'
  AND UPPER(i.currency) IN ('USD','CAD','GBP');

UPDATE instruments
SET currency = 'USD'
WHERE UPPER(ticker) = 'XRH0'
  AND UPPER(exchange) IN ('LSE', 'GB')
  AND UPPER(currency) = 'GBP';
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Silver miners'
WHERE UPPER(ticker) IN ('AYA','CDE','EDR','HL','MAG','PAAS','SCZ','SIL','SILJ','SLVM','SVM');
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Gold miners'
WHERE UPPER(ticker) IN ('ASL','B','GDX','NEM','NST','RRL','VAU','WRN');
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Uranium miners'
WHERE UPPER(ticker) IN ('ATOM','BMN','CCJ','DML','DYL','NXG','NUKZ','PDN','U','U.UN','URA','URNM','UUUU');
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Uranium explorers'
WHERE UPPER(ticker) = 'LAM';
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Technology'
WHERE UPPER(ticker) = 'VELO';
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Oil'
WHERE UPPER(ticker) IN ('EC','XOM');
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Broad equities'
WHERE UPPER(ticker) = 'DBA';
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Silver bullion'
WHERE UPPER(ticker) = 'ETPMAG';
--> statement-breakpoint
UPDATE instruments
SET asset_class = 'Rhodium metal'
WHERE UPPER(ticker) = 'XRH0';
--> statement-breakpoint
INSERT INTO allocation_targets (sector, target_percent)
VALUES
  ('Uranium explorers', 0),
  ('Technology', 0),
  ('Broad equities', 0)
ON CONFLICT (sector) DO NOTHING;

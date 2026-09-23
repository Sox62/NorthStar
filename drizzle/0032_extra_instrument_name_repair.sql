WITH canonical_names(symbol, name) AS (
  VALUES
    ('COP', 'ConocoPhillips'),
    ('CORN', 'Teucrium Corn Fund'),
    ('MGY', 'Magnolia Oil & Gas Corp.'),
    ('STNG', 'Scorpio Tankers Inc.'),
    ('WGX', 'Westgold Resources Limited')
)
UPDATE instruments i
SET name = cn.name
FROM canonical_names cn
WHERE UPPER(i.ticker) = cn.symbol;

WITH canonical_names(symbol, name) AS (
  VALUES
    ('COP', 'ConocoPhillips'),
    ('CORN', 'Teucrium Corn Fund'),
    ('MGY', 'Magnolia Oil & Gas Corp.'),
    ('STNG', 'Scorpio Tankers Inc.'),
    ('WGX', 'Westgold Resources Limited')
)
UPDATE ibkr_open_orders oo
SET name = cn.name
FROM canonical_names cn
WHERE UPPER(oo.symbol) = cn.symbol;

WITH canonical_names(symbol, name) AS (
  VALUES
    ('COP', 'ConocoPhillips'),
    ('CORN', 'Teucrium Corn Fund'),
    ('MGY', 'Magnolia Oil & Gas Corp.'),
    ('STNG', 'Scorpio Tankers Inc.'),
    ('WGX', 'Westgold Resources Limited')
)
UPDATE miner_fundamentals mf
SET name = cn.name
FROM canonical_names cn
WHERE UPPER(mf.symbol) = cn.symbol;

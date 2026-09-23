WITH canonical_names(symbol, name) AS (
  VALUES
    ('AG', 'First Majestic Silver Corp.'),
    ('ASL', 'Andean Silver Limited'),
    ('ASM', 'Avino Silver & Gold Mines Ltd.'),
    ('AYA', 'Aya Gold & Silver Inc.'),
    ('BMN', 'Bannerman Energy Ltd.'),
    ('CCJ', 'Cameco Corp.'),
    ('CDE', 'Coeur Mining Inc.'),
    ('CMM', 'Capricorn Metals Ltd.'),
    ('DBA', 'Invesco DB Agriculture Fund'),
    ('DML', 'Denison Mines Corp.'),
    ('DYL', 'Deep Yellow Limited'),
    ('EC', 'Ecopetrol S.A.'),
    ('EDR', 'Endeavour Silver Corp.'),
    ('EU', 'enCore Energy Corp.'),
    ('GGP', 'Greatland Resources Limited'),
    ('HL', 'Hecla Mining Company'),
    ('HSTR', 'Heliostar Metals Ltd.'),
    ('KGC', 'Kinross Gold Corporation'),
    ('LAM', 'Laramide Resources Ltd.'),
    ('LEU', 'Centrus Energy Corp.'),
    ('MAG', 'MAG Silver Corp.'),
    ('NEM', 'Newmont Corporation'),
    ('NST', 'Northern Star Resources Ltd.'),
    ('NXG', 'NexGen Energy Ltd.'),
    ('PAAS', 'Pan American Silver Corp.'),
    ('PDN', 'Paladin Energy Ltd.'),
    ('RRL', 'Regis Resources Limited'),
    ('SCZ', 'Santacruz Silver Mining Ltd.'),
    ('SLX', 'Silex Systems Limited'),
    ('SVM', 'Silvercorp Metals Inc.'),
    ('UUUU', 'Energy Fuels Inc.'),
    ('VAU', 'Vault Minerals Limited'),
    ('VELO', 'Velocity Composites plc'),
    ('WRN', 'Western Copper and Gold Corporation'),
    ('XOM', 'Exxon Mobil Corporation'),
    ('XOP', 'SPDR S&P Oil & Gas Exploration & Production ETF'),
    ('XRH0', 'Xtrackers Physical Rhodium ETC')
)
UPDATE instruments i
SET name = cn.name
FROM canonical_names cn
WHERE UPPER(i.ticker) = cn.symbol;

WITH canonical_names(symbol, name) AS (
  VALUES
    ('AG', 'First Majestic Silver Corp.'),
    ('ASL', 'Andean Silver Limited'),
    ('ASM', 'Avino Silver & Gold Mines Ltd.'),
    ('AYA', 'Aya Gold & Silver Inc.'),
    ('BMN', 'Bannerman Energy Ltd.'),
    ('CCJ', 'Cameco Corp.'),
    ('CDE', 'Coeur Mining Inc.'),
    ('CMM', 'Capricorn Metals Ltd.'),
    ('DBA', 'Invesco DB Agriculture Fund'),
    ('DML', 'Denison Mines Corp.'),
    ('DYL', 'Deep Yellow Limited'),
    ('EC', 'Ecopetrol S.A.'),
    ('EDR', 'Endeavour Silver Corp.'),
    ('EU', 'enCore Energy Corp.'),
    ('GGP', 'Greatland Resources Limited'),
    ('HL', 'Hecla Mining Company'),
    ('HSTR', 'Heliostar Metals Ltd.'),
    ('KGC', 'Kinross Gold Corporation'),
    ('LAM', 'Laramide Resources Ltd.'),
    ('LEU', 'Centrus Energy Corp.'),
    ('MAG', 'MAG Silver Corp.'),
    ('NEM', 'Newmont Corporation'),
    ('NST', 'Northern Star Resources Ltd.'),
    ('NXG', 'NexGen Energy Ltd.'),
    ('PAAS', 'Pan American Silver Corp.'),
    ('PDN', 'Paladin Energy Ltd.'),
    ('RRL', 'Regis Resources Limited'),
    ('SCZ', 'Santacruz Silver Mining Ltd.'),
    ('SLX', 'Silex Systems Limited'),
    ('SVM', 'Silvercorp Metals Inc.'),
    ('UUUU', 'Energy Fuels Inc.'),
    ('VAU', 'Vault Minerals Limited'),
    ('VELO', 'Velocity Composites plc'),
    ('WRN', 'Western Copper and Gold Corporation'),
    ('XOM', 'Exxon Mobil Corporation'),
    ('XOP', 'SPDR S&P Oil & Gas Exploration & Production ETF'),
    ('XRH0', 'Xtrackers Physical Rhodium ETC')
)
UPDATE ibkr_open_orders oo
SET name = cn.name
FROM canonical_names cn
WHERE UPPER(oo.symbol) = cn.symbol;

WITH canonical_names(symbol, name) AS (
  VALUES
    ('AG', 'First Majestic Silver Corp.'),
    ('ASL', 'Andean Silver Limited'),
    ('ASM', 'Avino Silver & Gold Mines Ltd.'),
    ('AYA', 'Aya Gold & Silver Inc.'),
    ('BMN', 'Bannerman Energy Ltd.'),
    ('CCJ', 'Cameco Corp.'),
    ('CDE', 'Coeur Mining Inc.'),
    ('CMM', 'Capricorn Metals Ltd.'),
    ('DBA', 'Invesco DB Agriculture Fund'),
    ('DML', 'Denison Mines Corp.'),
    ('DYL', 'Deep Yellow Limited'),
    ('EC', 'Ecopetrol S.A.'),
    ('EDR', 'Endeavour Silver Corp.'),
    ('EU', 'enCore Energy Corp.'),
    ('GGP', 'Greatland Resources Limited'),
    ('HL', 'Hecla Mining Company'),
    ('HSTR', 'Heliostar Metals Ltd.'),
    ('KGC', 'Kinross Gold Corporation'),
    ('LAM', 'Laramide Resources Ltd.'),
    ('LEU', 'Centrus Energy Corp.'),
    ('MAG', 'MAG Silver Corp.'),
    ('NEM', 'Newmont Corporation'),
    ('NST', 'Northern Star Resources Ltd.'),
    ('NXG', 'NexGen Energy Ltd.'),
    ('PAAS', 'Pan American Silver Corp.'),
    ('PDN', 'Paladin Energy Ltd.'),
    ('RRL', 'Regis Resources Limited'),
    ('SCZ', 'Santacruz Silver Mining Ltd.'),
    ('SLX', 'Silex Systems Limited'),
    ('SVM', 'Silvercorp Metals Inc.'),
    ('UUUU', 'Energy Fuels Inc.'),
    ('VAU', 'Vault Minerals Limited'),
    ('VELO', 'Velocity Composites plc'),
    ('WRN', 'Western Copper and Gold Corporation'),
    ('XOM', 'Exxon Mobil Corporation'),
    ('XOP', 'SPDR S&P Oil & Gas Exploration & Production ETF'),
    ('XRH0', 'Xtrackers Physical Rhodium ETC')
)
UPDATE miner_fundamentals mf
SET name = cn.name
FROM canonical_names cn
WHERE UPPER(mf.symbol) = cn.symbol;

DELETE FROM "miner_fundamentals" AS mf
WHERE mf."symbol" IN (
  'ATOM', 'B', 'DML', 'EDR', 'EU', 'GGP', 'HSTR',
  'LAM', 'NUKZ', 'SCZ', 'SLVM', 'U', 'U.UN', 'URA'
)
AND NOT EXISTS (
  SELECT 1
  FROM "current_positions" cp
  JOIN "instruments" i ON i."id" = cp."instrument_id"
  WHERE UPPER(i."ticker") = mf."symbol"
    AND cp."quantity"::numeric <> 0
);

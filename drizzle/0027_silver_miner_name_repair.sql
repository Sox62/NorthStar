UPDATE instruments
SET name = 'Endeavour Silver Corp'
WHERE UPPER(ticker) = 'EDR';

UPDATE instruments
SET name = 'Hecla'
WHERE UPPER(ticker) = 'HL';

UPDATE ibkr_open_orders
SET name = 'Endeavour Silver Corp'
WHERE UPPER(symbol) = 'EDR';

UPDATE ibkr_open_orders
SET name = 'Hecla'
WHERE UPPER(symbol) = 'HL';

UPDATE position_risk_plans
SET name = 'Endeavour Silver Corp'
WHERE UPPER(symbol) = 'EDR';

UPDATE position_risk_plans
SET name = 'Hecla'
WHERE UPPER(symbol) = 'HL';

UPDATE miner_fundamentals
SET name = 'Endeavour Silver Corp'
WHERE UPPER(symbol) = 'EDR';

UPDATE miner_fundamentals
SET name = 'Hecla'
WHERE UPPER(symbol) = 'HL';

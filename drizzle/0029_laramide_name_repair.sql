UPDATE instruments
SET name = 'Laramide'
WHERE UPPER(ticker) = 'LAM';

UPDATE ibkr_open_orders
SET name = 'Laramide'
WHERE UPPER(symbol) = 'LAM';

UPDATE position_risk_plans
SET name = 'Laramide'
WHERE UPPER(symbol) = 'LAM';

UPDATE miner_fundamentals
SET name = 'Laramide'
WHERE UPPER(symbol) = 'LAM';

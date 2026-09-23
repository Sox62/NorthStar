UPDATE instruments
SET name = 'Barrick Mining Corporation'
WHERE UPPER(ticker) = 'B';

UPDATE ibkr_open_orders
SET name = 'Barrick Mining Corporation'
WHERE UPPER(symbol) = 'B';

UPDATE miner_fundamentals
SET name = 'Barrick Mining Corporation'
WHERE UPPER(symbol) = 'B';

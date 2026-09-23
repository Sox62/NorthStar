UPDATE instruments
SET name = 'Deep Yellow'
WHERE UPPER(ticker) = 'DYL';

UPDATE ibkr_open_orders
SET name = 'Deep Yellow'
WHERE UPPER(symbol) = 'DYL';

UPDATE miner_fundamentals
SET name = 'Deep Yellow'
WHERE UPPER(symbol) = 'DYL';

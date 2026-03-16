CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100),
    is_active BOOLEAN,
    created_at TIMESTAMP,
    customer_segment VARCHAR(20)
);
INSERT INTO customers (id, first_name, last_name)
SELECT id, first_name, last_name
FROM read_csv('/data/seeds/customers.csv', header = true, columns = {
    'id': 'INTEGER',
    'first_name': 'VARCHAR',
    'last_name': 'VARCHAR'
});

UPDATE customers SET
    email = LOWER(CONCAT(first_name, '.', last_name, '@example.com')),
    is_active = (id % 3 != 0),
    created_at = CAST('2017-01-01' AS TIMESTAMP) + INTERVAL (id) DAY,
    customer_segment = CASE
        WHEN id % 5 = 0 THEN 'enterprise'
        WHEN id % 5 = 1 THEN 'small_business'
        WHEN id % 5 = 2 THEN 'individual'
        WHEN id % 5 = 3 THEN 'non_profit'
        ELSE 'startup'
    END;

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    order_date DATE,
    status VARCHAR(20),
    created_at TIMESTAMP,
    is_gift BOOLEAN,
    priority INTEGER
);
INSERT INTO orders (id, customer_id, order_date, status)
SELECT id, customer_id, order_date, status
FROM read_csv('/data/seeds/orders.csv', header = true, columns = {
    'id': 'INTEGER',
    'customer_id': 'INTEGER',
    'order_date': 'DATE',
    'status': 'VARCHAR'
});

UPDATE orders SET
    created_at = CAST(order_date AS TIMESTAMP) + INTERVAL (CAST(FLOOR(RANDOM() * 24) AS INTEGER)) HOUR,
    is_gift = (id % 7 = 0),
    priority = CASE
        WHEN status = 'placed' THEN 1
        WHEN status = 'shipped' THEN 2
        WHEN status IN ('completed', 'returned') THEN 3
        ELSE 4
    END;

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    payment_method VARCHAR(20),
    amount DECIMAL(10,2),
    tax DECIMAL(10,2),
    discount DECIMAL(10,2),
    processing_fee DECIMAL(10,2),
    refund_amount DECIMAL(10,2),
    created_at TIMESTAMP,
    is_successful BOOLEAN,
    currency VARCHAR(3)
);
INSERT INTO payments (id, order_id, payment_method, amount, tax, discount, processing_fee)
SELECT id, order_id, payment_method, amount, tax, discount, processing_fee
FROM read_csv('/data/seeds/payments.csv', header = true, columns = {
    'id': 'INTEGER',
    'order_id': 'INTEGER',
    'payment_method': 'VARCHAR',
    'amount': 'DECIMAL(10,2)',
    'tax': 'DECIMAL(10,2)',
    'discount': 'DECIMAL(10,2)',
    'processing_fee': 'DECIMAL(10,2)'
});

UPDATE payments SET
    refund_amount = CASE
        WHEN id % 10 = 0 THEN -amount
        WHEN id % 15 = 0 AND id % 10 != 0 THEN -(amount * 0.5)
        ELSE 0.00
    END,
    created_at = CAST('2018-01-01' AS TIMESTAMP) + INTERVAL (id) HOUR,
    is_successful = (id % 20 != 0),
    currency = CASE
        WHEN id % 10 = 0 THEN 'EUR'
        WHEN id % 10 = 1 THEN 'GBP'
        WHEN id % 10 = 2 THEN 'JPY'
        ELSE 'USD'
    END;

UPDATE payments SET
    discount = NULL
WHERE id % 25 = 0;

UPDATE payments SET
    processing_fee = NULL
WHERE id % 30 = 0;

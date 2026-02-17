CREATE TABLE IF NOT EXISTS raw_customers (
    id INTEGER PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100),
    is_active BOOLEAN,
    created_at TIMESTAMP,
    customer_segment VARCHAR(20)
);
COPY raw_customers (id, first_name, last_name) FROM '/data/seeds/raw_customers.csv' DELIMITER ',' CSV HEADER;

-- Add comprehensive test data
UPDATE raw_customers SET 
    email = LOWER(first_name || '.' || last_name || '@example.com'),
    is_active = (id % 3 != 0),  -- Mix of true/false
    created_at = '2017-01-01'::timestamp + (id || ' days')::interval,
    customer_segment = CASE 
        WHEN id % 5 = 0 THEN 'enterprise'
        WHEN id % 5 = 1 THEN 'small_business'
        WHEN id % 5 = 2 THEN 'individual'
        WHEN id % 5 = 3 THEN 'non_profit'
        ELSE 'startup'
    END;

CREATE TABLE IF NOT EXISTS raw_orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    raw_customer_id INTEGER,
    order_date DATE,
    status VARCHAR(20),
    created_at TIMESTAMP,
    is_gift BOOLEAN,
    priority INTEGER,
    CONSTRAINT raw_orders_raw_customer_id_fkey
        FOREIGN KEY (raw_customer_id) REFERENCES raw_customers(id)
);
COPY raw_orders (id, user_id, order_date, status) FROM '/data/seeds/raw_orders.csv' DELIMITER ',' CSV HEADER;

-- Add comprehensive test data
UPDATE raw_orders SET 
    -- Keep backwards-compatible user_id while also exposing raw_customer_id for Cube join heuristics
    raw_customer_id = user_id,
    created_at = order_date::timestamp + (RANDOM() * 24 || ' hours')::interval,
    is_gift = (id % 7 = 0),  -- Some orders are gifts
    priority = CASE 
        WHEN status = 'placed' THEN 1
        WHEN status = 'shipped' THEN 2
        WHEN status IN ('completed', 'returned') THEN 3
        ELSE 4
    END;

CREATE TABLE IF NOT EXISTS raw_payments (
    id INTEGER PRIMARY KEY,
    order_id INTEGER,
    raw_order_id INTEGER,
    payment_method VARCHAR(20),
    amount DECIMAL(10,2),
    tax DECIMAL(10,2),
    discount DECIMAL(10,2),
    processing_fee DECIMAL(10,2),
    refund_amount DECIMAL(10,2),
    created_at TIMESTAMP,
    is_successful BOOLEAN,
    currency VARCHAR(3),
    CONSTRAINT raw_payments_raw_order_id_fkey
        FOREIGN KEY (raw_order_id) REFERENCES raw_orders(id)
);
COPY raw_payments (id, order_id, payment_method, amount, tax, discount, processing_fee) FROM '/data/seeds/raw_payments.csv' DELIMITER ',' CSV HEADER;

-- Add comprehensive test data including edge cases
UPDATE raw_payments SET 
    -- Keep backwards-compatible order_id while also exposing raw_order_id for Cube join heuristics
    raw_order_id = order_id,
    -- Add refunds (negative numbers)
    refund_amount = CASE 
        WHEN id % 10 = 0 THEN -amount  -- Full refund
        WHEN id % 15 = 0 AND id % 10 != 0 THEN -(amount * 0.5)  -- Partial refund (exclude overlaps)
        ELSE 0.00
    END,
    created_at = '2018-01-01'::timestamp + (id || ' hours')::interval,
    is_successful = (id % 20 != 0),  -- 5% failure rate
    currency = CASE 
        WHEN id % 10 = 0 THEN 'EUR'
        WHEN id % 10 = 1 THEN 'GBP'
        WHEN id % 10 = 2 THEN 'JPY'
        ELSE 'USD'
    END;

-- Add some NULL values for comprehensive testing
UPDATE raw_payments SET 
    discount = NULL 
WHERE id % 25 = 0;

UPDATE raw_payments SET 
    processing_fee = NULL 
WHERE id % 30 = 0;

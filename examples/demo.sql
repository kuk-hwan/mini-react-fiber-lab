-- Schema already exists; IDs are assigned by the engine.
INSERT INTO scores (name, attempts, pairs) VALUES ('첫 게임', 12, 8);
INSERT INTO products (name, price) VALUES ('카드 덱', 15000);
SELECT * FROM scores WHERE id = 1;
SELECT name, attempts FROM scores WHERE name = '첫 게임';
SELECT * FROM products LIMIT 10;

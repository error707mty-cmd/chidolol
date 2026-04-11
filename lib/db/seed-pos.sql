-- Seed inicial para el sistema POS
-- Escalas de precios por defecto

-- Precios NORMALES (cliente regular)
INSERT INTO pos_price_tiers (name, min_meters, max_meters, price_per_meter, is_active) VALUES
('Normal 1-2m', 1.00, 2.99, 250.00, true),
('Normal 3-4m', 3.00, 4.99, 230.00, true),
('Normal 5+m', 5.00, NULL, 200.00, true);

-- Precios REVENDEDOR
INSERT INTO pos_price_tiers (name, min_meters, max_meters, price_per_meter, is_active) VALUES
('Revendedor 1-2m', 1.00, 2.99, 180.00, true),
('Revendedor 3-4m', 3.00, 4.99, 170.00, true),
('Revendedor 5+m', 5.00, NULL, 160.00, true);

-- Precios ESPECIAL
INSERT INTO pos_price_tiers (name, min_meters, max_meters, price_per_meter, is_active) VALUES
('Especial 1-2m', 1.00, 2.99, 140.00, true),
('Especial 3-4m', 3.00, 4.99, 135.00, true),
('Especial 5+m', 5.00, NULL, 130.00, true);

-- Cliente de ejemplo
INSERT INTO pos_customers (name, email, phone, price_type, notes) VALUES
('Cliente General', NULL, NULL, 'normal', 'Cliente walk-in sin registro');

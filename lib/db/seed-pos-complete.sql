-- Seed data para el sistema POS

-- Insertar configuración del negocio
INSERT INTO business_config (
  business_name, 
  address, 
  phone, 
  email, 
  rfc,
  ticket_header,
  ticket_footer
) VALUES (
  'DTF Pliego - Impresión Digital',
  'Av. Revolución 123, Monterrey, NL',
  '+52 81 1234 5678',
  'contacto@dtfpliego.com',
  'DTP230515ABC',
  '¡Gracias por tu compra!',
  'Conserva tu ticket para cualquier aclaración. Visítanos en www.dtfpliego.com'
) ON CONFLICT DO NOTHING;

-- Insertar escalas de precios
INSERT INTO pos_price_tiers (name, min_meters, max_meters, price_per_meter, is_active) VALUES
('normal', 0, 9.99, 250, true),
('normal', 10, 49.99, 230, true),
('normal', 50, NULL, 200, true),
('revendedor', 0, 9.99, 220, true),
('revendedor', 10, 49.99, 200, true),
('revendedor', 50, NULL, 180, true),
('especial', 0, NULL, 150, true)
ON CONFLICT DO NOTHING;

-- Insertar clientes de ejemplo
INSERT INTO pos_customers (name, email, phone, price_type, notes) VALUES
('Cliente General', NULL, NULL, 'normal', 'Cliente sin registro'),
('Juan Pérez', 'juan@example.com', '8112345678', 'normal', NULL),
('María González Revendedora', 'maria@revendedora.com', '8123456789', 'revendedor', 'Cliente frecuente - pago quincenal'),
('Empresa ABC', 'contacto@abc.com', '8134567890', 'especial', 'Contrato anual - precio especial'),
('Luis Martínez', 'luis@example.com', '8145678901', 'normal', NULL)
ON CONFLICT DO NOTHING;

-- Insertar productos de inventario
INSERT INTO pos_inventory (product_name, description, stock, unit, cost, low_stock_alert, is_active) VALUES
('Film DTF Premium', 'Rollo de 60cm x 100m', 450, 'metros', 12.50, 50, true),
('Polvo Adhesivo Hot Melt', 'Polvo termoadhesivo profesional', 25, 'kilos', 380, 5, true),
('Tinta DTF Blanca', 'Tinta blanca para impresora DTF', 8, 'litros', 850, 2, true),
('Tinta DTF Color CMYK', 'Set de 4 colores CMYK', 12, 'litros', 1200, 3, true),
('Papel Transfer', 'Papel transfer A4', 150, 'piezas', 2.5, 20, true)
ON CONFLICT DO NOTHING;

SELECT 'Seed data inserted successfully!' as status;

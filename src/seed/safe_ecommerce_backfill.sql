-- Safe e-commerce backfill migration (MySQL 8+)
-- Idempotent: can be executed multiple times.
-- Use this when environments are partially migrated.

START TRANSACTION;

DROP PROCEDURE IF EXISTS run_if;
DELIMITER $$
CREATE PROCEDURE run_if(IN p_condition BOOLEAN, IN p_sql TEXT)
BEGIN
  IF p_condition THEN
    SET @stmt = p_sql;
    PREPARE s FROM @stmt;
    EXECUTE s;
    DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;

-- password_reset_tokens actor_type compatibility
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'password_reset_tokens') = 1,
  "ALTER TABLE password_reset_tokens MODIFY COLUMN actor_type ENUM('platform','merchant','buyer') NOT NULL"
);

-- buyers core tables
CREATE TABLE IF NOT EXISTS buyers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  business_registration_number VARCHAR(120) NULL,
  tax_id VARCHAR(120) NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  status ENUM('active','suspended','pending_verification') NOT NULL DEFAULT 'pending_verification',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buyers_email (email),
  KEY idx_buyers_status (status)
);

CREATE TABLE IF NOT EXISTS buyer_roles (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buyer_roles_name (buyer_id, name),
  KEY idx_buyer_roles_buyer (buyer_id)
);

CREATE TABLE IF NOT EXISTS buyer_users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  role_id INT NULL,
  status ENUM('active','inactive','invited') NOT NULL DEFAULT 'active',
  email_verified_at TIMESTAMP NULL,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buyer_users_email (email),
  KEY idx_buyer_users_buyer (buyer_id),
  KEY idx_buyer_users_role (role_id)
);

CREATE TABLE IF NOT EXISTS buyer_addresses (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  label VARCHAR(120) NOT NULL,
  contact_name VARCHAR(255) NULL,
  contact_phone VARCHAR(40) NULL,
  street_address TEXT NOT NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(120) NULL,
  postal_code VARCHAR(40) NULL,
  country VARCHAR(120) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_buyer_addresses_buyer (buyer_id)
);

CREATE TABLE IF NOT EXISTS buyer_payment_methods (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  type ENUM('credit_card','bank_transfer','paypal','manual') NOT NULL DEFAULT 'manual',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  card_brand VARCHAR(60) NULL,
  card_last4 VARCHAR(4) NULL,
  payment_gateway_token VARCHAR(255) NULL,
  expiry_date VARCHAR(20) NULL,
  billing_address_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_buyer_payment_methods_buyer (buyer_id),
  KEY idx_buyer_payment_methods_billing_address (billing_address_id)
);

-- products: required columns for storefront/cart/checkout
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'merchant_id') = 0,
  "ALTER TABLE products ADD COLUMN merchant_id INT NULL AFTER branch_id"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'provider_name') = 0,
  "ALTER TABLE products ADD COLUMN provider_name VARCHAR(255) NULL AFTER description"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'base_price') = 0,
  "ALTER TABLE products ADD COLUMN base_price DECIMAL(12,2) NULL AFTER provider_name"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'sku') = 0,
  "ALTER TABLE products ADD COLUMN sku VARCHAR(120) NULL AFTER base_price"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'min_order_quantity') = 0,
  "ALTER TABLE products ADD COLUMN min_order_quantity INT NOT NULL DEFAULT 1 AFTER sku"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'max_order_quantity') = 0,
  "ALTER TABLE products ADD COLUMN max_order_quantity INT NULL AFTER min_order_quantity"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'is_active') = 0,
  "ALTER TABLE products ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER status"
);

-- products indexes
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'products' AND index_name = 'idx_products_merchant') = 0,
  "ALTER TABLE products ADD KEY idx_products_merchant (merchant_id)"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'products' AND index_name = 'idx_products_status') = 0,
  "ALTER TABLE products ADD KEY idx_products_status (status)"
);

-- product_images: optional ordering/primary fields
CREATE TABLE IF NOT EXISTS product_images (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  url TEXT NOT NULL,
  sort_order INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product_images' AND column_name = 'variant_id') = 0,
  "ALTER TABLE product_images ADD COLUMN variant_id INT NULL AFTER product_id"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product_images' AND column_name = 'alt_text') = 0,
  "ALTER TABLE product_images ADD COLUMN alt_text VARCHAR(255) NULL AFTER url"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product_images' AND column_name = 'position') = 0,
  "ALTER TABLE product_images ADD COLUMN position INT NULL AFTER alt_text"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product_images' AND column_name = 'is_primary') = 0,
  "ALTER TABLE product_images ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE AFTER position"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'product_images' AND index_name = 'idx_product_images_variant') = 0,
  "ALTER TABLE product_images ADD KEY idx_product_images_variant (variant_id)"
);

-- carts and cart items
CREATE TABLE IF NOT EXISTS carts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NULL,
  buyer_user_id INT NULL,
  session_id VARCHAR(120) NULL,
  status ENUM('active','abandoned','converted') NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_carts_buyer (buyer_id),
  KEY idx_carts_buyer_user (buyer_user_id),
  KEY idx_carts_session (session_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NULL,
  merchant_id INT NOT NULL,
  branch_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cart_items_cart (cart_id),
  KEY idx_cart_items_product (product_id),
  KEY idx_cart_items_merchant (merchant_id),
  KEY idx_cart_items_branch (branch_id)
);

-- orders and order items (columns required by current backend)
CREATE TABLE IF NOT EXISTS orders (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(80) NOT NULL,
  buyer_id INT NOT NULL,
  buyer_user_id INT NOT NULL,
  merchant_id INT NOT NULL,
  branch_id INT NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status ENUM('pending','confirmed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  shipping_address_id INT NULL,
  billing_address_id INT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_order_number (order_number),
  KEY idx_orders_buyer (buyer_id),
  KEY idx_orders_buyer_user (buyer_user_id),
  KEY idx_orders_merchant (merchant_id),
  KEY idx_orders_branch (branch_id),
  KEY idx_orders_status (status)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NULL,
  product_name VARCHAR(255) NOT NULL,
  variant_name VARCHAR(255) NULL,
  sku VARCHAR(120) NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status VARCHAR(40) NOT NULL,
  notes TEXT NULL,
  changed_by_type ENUM('buyer','merchant','admin') NOT NULL,
  changed_by_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order_status_history_order (order_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  buyer_id INT NOT NULL,
  payment_method_id INT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  payment_gateway VARCHAR(40) NULL,
  gateway_transaction_id VARCHAR(255) NULL,
  gateway_response JSON NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_payments_order (order_id),
  KEY idx_payments_buyer (buyer_id)
);

-- Foreign keys (only if not already present)
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'buyer_roles' AND constraint_name = 'fk_buyer_roles_buyer') = 0,
  "ALTER TABLE buyer_roles ADD CONSTRAINT fk_buyer_roles_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'buyer_users' AND constraint_name = 'fk_buyer_users_buyer') = 0,
  "ALTER TABLE buyer_users ADD CONSTRAINT fk_buyer_users_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'buyer_users' AND constraint_name = 'fk_buyer_users_role') = 0,
  "ALTER TABLE buyer_users ADD CONSTRAINT fk_buyer_users_role FOREIGN KEY (role_id) REFERENCES buyer_roles(id) ON DELETE SET NULL"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'buyer_addresses' AND constraint_name = 'fk_buyer_addresses_buyer') = 0,
  "ALTER TABLE buyer_addresses ADD CONSTRAINT fk_buyer_addresses_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'buyer_payment_methods' AND constraint_name = 'fk_buyer_payment_methods_buyer') = 0,
  "ALTER TABLE buyer_payment_methods ADD CONSTRAINT fk_buyer_payment_methods_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'buyer_payment_methods' AND constraint_name = 'fk_buyer_payment_methods_billing_address') = 0,
  "ALTER TABLE buyer_payment_methods ADD CONSTRAINT fk_buyer_payment_methods_billing_address FOREIGN KEY (billing_address_id) REFERENCES buyer_addresses(id) ON DELETE SET NULL"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'carts' AND constraint_name = 'fk_carts_buyer') = 0,
  "ALTER TABLE carts ADD CONSTRAINT fk_carts_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'carts' AND constraint_name = 'fk_carts_buyer_user') = 0,
  "ALTER TABLE carts ADD CONSTRAINT fk_carts_buyer_user FOREIGN KEY (buyer_user_id) REFERENCES buyer_users(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cart_items' AND constraint_name = 'fk_cart_items_cart') = 0,
  "ALTER TABLE cart_items ADD CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cart_items' AND constraint_name = 'fk_cart_items_product') = 0,
  "ALTER TABLE cart_items ADD CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'orders' AND constraint_name = 'fk_orders_buyer') = 0,
  "ALTER TABLE orders ADD CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'orders' AND constraint_name = 'fk_orders_buyer_user') = 0,
  "ALTER TABLE orders ADD CONSTRAINT fk_orders_buyer_user FOREIGN KEY (buyer_user_id) REFERENCES buyer_users(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'order_items' AND constraint_name = 'fk_order_items_order') = 0,
  "ALTER TABLE order_items ADD CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'order_status_history' AND constraint_name = 'fk_order_status_history_order') = 0,
  "ALTER TABLE order_status_history ADD CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'payments' AND constraint_name = 'fk_payments_order') = 0,
  "ALTER TABLE payments ADD CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'payments' AND constraint_name = 'fk_payments_buyer') = 0,
  "ALTER TABLE payments ADD CONSTRAINT fk_payments_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE"
);
CALL run_if(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'payments' AND constraint_name = 'fk_payments_payment_method') = 0,
  "ALTER TABLE payments ADD CONSTRAINT fk_payments_payment_method FOREIGN KEY (payment_method_id) REFERENCES buyer_payment_methods(id) ON DELETE SET NULL"
);

-- optional buyer permissions seed
CREATE TABLE IF NOT EXISTS buyer_permissions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  module VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buyer_permissions_name (name)
);

INSERT IGNORE INTO buyer_permissions (name, description, module) VALUES
('place_orders', 'Place orders', 'orders'),
('approve_orders', 'Approve orders', 'orders'),
('view_orders', 'View orders', 'orders'),
('view_invoices', 'View invoices', 'invoices'),
('manage_addresses', 'Manage company addresses', 'buyers'),
('manage_payment_methods', 'Manage payment methods', 'buyers'),
('manage_team', 'Manage buyer team members', 'buyers'),
('view_reports', 'View buyer reports', 'reports');

DROP PROCEDURE IF EXISTS run_if;
COMMIT;

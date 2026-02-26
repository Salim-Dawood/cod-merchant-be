-- Buyer accounts + e-commerce foundation schema
-- Run manually against an existing database (MySQL 8+ recommended).
-- This is additive and aims to preserve existing merchant/product APIs.

START TRANSACTION;

-- Allow password reset tokens for buyer users.
ALTER TABLE password_reset_tokens
  MODIFY COLUMN actor_type ENUM('platform','merchant','buyer') NOT NULL;

-- Buyer companies
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

-- Buyer users permissions model
CREATE TABLE IF NOT EXISTS buyer_roles (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buyer_roles_name (buyer_id, name),
  KEY idx_buyer_roles_buyer (buyer_id),
  CONSTRAINT fk_buyer_roles_buyer
    FOREIGN KEY (buyer_id) REFERENCES buyers(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS buyer_permissions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  module VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buyer_permissions_name (name)
);

CREATE TABLE IF NOT EXISTS buyer_role_permissions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_role_id INT NOT NULL,
  buyer_permission_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buyer_role_permissions_pair (buyer_role_id, buyer_permission_id),
  KEY idx_buyer_role_permissions_role (buyer_role_id),
  KEY idx_buyer_role_permissions_perm (buyer_permission_id),
  CONSTRAINT fk_buyer_role_permissions_role
    FOREIGN KEY (buyer_role_id) REFERENCES buyer_roles(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_buyer_role_permissions_permission
    FOREIGN KEY (buyer_permission_id) REFERENCES buyer_permissions(id)
    ON DELETE CASCADE
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
  KEY idx_buyer_users_role (role_id),
  CONSTRAINT fk_buyer_users_buyer
    FOREIGN KEY (buyer_id) REFERENCES buyers(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_buyer_users_role
    FOREIGN KEY (role_id) REFERENCES buyer_roles(id)
    ON DELETE SET NULL
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
  KEY idx_buyer_addresses_buyer (buyer_id),
  CONSTRAINT fk_buyer_addresses_buyer
    FOREIGN KEY (buyer_id) REFERENCES buyers(id)
    ON DELETE CASCADE
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
  KEY idx_buyer_payment_methods_billing_address (billing_address_id),
  CONSTRAINT fk_buyer_payment_methods_buyer
    FOREIGN KEY (buyer_id) REFERENCES buyers(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_buyer_payment_methods_billing_address
    FOREIGN KEY (billing_address_id) REFERENCES buyer_addresses(id)
    ON DELETE SET NULL
);

COMMIT;

-- Product system upgrades (non-breaking extensions to existing tables)
ALTER TABLE products
  ADD COLUMN merchant_id INT NULL AFTER branch_id,
  ADD COLUMN short_description VARCHAR(500) NULL AFTER description,
  ADD COLUMN base_price DECIMAL(12,2) NULL AFTER short_description,
  ADD COLUMN sku VARCHAR(120) NULL AFTER base_price,
  ADD COLUMN min_order_quantity INT NOT NULL DEFAULT 1 AFTER sku,
  ADD COLUMN max_order_quantity INT NULL AFTER min_order_quantity,
  ADD COLUMN unit VARCHAR(40) NULL AFTER max_order_quantity,
  ADD COLUMN weight DECIMAL(12,3) NULL AFTER unit,
  ADD COLUMN dimensions JSON NULL AFTER weight,
  ADD COLUMN featured BOOLEAN NOT NULL DEFAULT FALSE AFTER status,
  ADD COLUMN views_count INT NOT NULL DEFAULT 0 AFTER featured;

ALTER TABLE products
  ADD UNIQUE KEY uq_products_sku (sku),
  ADD KEY idx_products_merchant (merchant_id),
  ADD KEY idx_products_status (status);

ALTER TABLE products
  ADD CONSTRAINT fk_products_merchant
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ON DELETE SET NULL;

-- Keep existing product_images table and extend it.
ALTER TABLE product_images
  ADD COLUMN variant_id INT NULL AFTER product_id,
  ADD COLUMN alt_text VARCHAR(255) NULL AFTER url,
  ADD COLUMN position INT NULL AFTER alt_text,
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE AFTER position,
  ADD KEY idx_product_images_variant (variant_id);

CREATE TABLE IF NOT EXISTS product_variants (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  sku VARCHAR(120) NOT NULL,
  name VARCHAR(255) NOT NULL,
  attributes JSON NULL,
  price DECIMAL(12,2) NOT NULL,
  compare_at_price DECIMAL(12,2) NULL,
  cost_price DECIMAL(12,2) NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 0,
  weight DECIMAL(12,3) NULL,
  barcode VARCHAR(120) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_variants_sku (sku),
  KEY idx_product_variants_product (product_id),
  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

ALTER TABLE product_images
  ADD CONSTRAINT fk_product_images_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS product_specifications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  attribute_name VARCHAR(120) NOT NULL,
  attribute_value TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_product_specifications_product (product_id),
  CONSTRAINT fk_product_specifications_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  variant_id INT NULL,
  branch_id INT NOT NULL,
  quantity_change INT NOT NULL,
  quantity_after INT NULL,
  type ENUM('purchase','sale','adjustment','return') NOT NULL,
  reference_type VARCHAR(60) NULL,
  reference_id INT NULL,
  notes TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_inventory_ledger_product (product_id),
  KEY idx_inventory_ledger_variant (variant_id),
  KEY idx_inventory_ledger_branch (branch_id),
  KEY idx_inventory_ledger_reference (reference_type, reference_id),
  CONSTRAINT fk_inventory_ledger_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_inventory_ledger_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_inventory_ledger_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_inventory_ledger_created_by_user
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
);

-- Shopping carts and checkout
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
  KEY idx_carts_session (session_id),
  CONSTRAINT fk_carts_buyer
    FOREIGN KEY (buyer_id) REFERENCES buyers(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_carts_buyer_user
    FOREIGN KEY (buyer_user_id) REFERENCES buyer_users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NULL,
  merchant_id INT NOT NULL,
  branch_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cart_items_cart (cart_id),
  KEY idx_cart_items_product (product_id),
  CONSTRAINT fk_cart_items_cart
    FOREIGN KEY (cart_id) REFERENCES carts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_cart_items_merchant
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wishlists (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  buyer_user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wishlists_buyer_user_product (buyer_user_id, product_id),
  KEY idx_wishlists_product (product_id),
  CONSTRAINT fk_wishlists_buyer_user
    FOREIGN KEY (buyer_user_id) REFERENCES buyer_users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_wishlists_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

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
  KEY idx_orders_status (status),
  CONSTRAINT fk_orders_buyer
    FOREIGN KEY (buyer_id) REFERENCES buyers(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_orders_buyer_user
    FOREIGN KEY (buyer_user_id) REFERENCES buyer_users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_orders_merchant
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_orders_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_orders_shipping_address
    FOREIGN KEY (shipping_address_id) REFERENCES buyer_addresses(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_orders_billing_address
    FOREIGN KEY (billing_address_id) REFERENCES buyer_addresses(id)
    ON DELETE SET NULL
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
  KEY idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_order_items_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status VARCHAR(40) NOT NULL,
  notes TEXT NULL,
  changed_by_type ENUM('buyer','merchant','admin') NOT NULL,
  changed_by_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order_status_history_order (order_id),
  CONSTRAINT fk_order_status_history_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
);

-- Payments and refunds
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
  KEY idx_payments_buyer (buyer_id),
  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_payments_buyer
    FOREIGN KEY (buyer_id) REFERENCES buyers(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_payments_payment_method
    FOREIGN KEY (payment_method_id) REFERENCES buyer_payment_methods(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  payment_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NULL,
  status ENUM('pending','approved','rejected','processed') NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_refunds_order (order_id),
  KEY idx_refunds_payment (payment_id),
  CONSTRAINT fk_refunds_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_refunds_payment
    FOREIGN KEY (payment_id) REFERENCES payments(id)
    ON DELETE CASCADE
);

ALTER TABLE platform_admins
  ADD COLUMN platform_role_id INT NULL AFTER id;

ALTER TABLE users
  ADD COLUMN merchant_role_id INT NULL AFTER branch_id;

ALTER TABLE branches
  ADD COLUMN flag_url TEXT NULL AFTER name;

CREATE TABLE IF NOT EXISTS platform_admin_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform_admin_id INT NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_platform_admin_photos_admin
    FOREIGN KEY (platform_admin_id) REFERENCES platform_admins(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_photos_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_type ENUM('platform','merchant','buyer') NOT NULL,
  actor_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_reset_actor (actor_type, actor_id),
  INDEX idx_password_reset_email (actor_type, email),
  INDEX idx_password_reset_token_hash (token_hash),
  INDEX idx_password_reset_expires (expires_at)
);

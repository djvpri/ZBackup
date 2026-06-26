-- ZBackup Database Schema
-- PostgreSQL

-- Users table (replaces basic auth)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Backup history
CREATE TABLE IF NOT EXISTS backup_history (
  id SERIAL PRIMARY KEY,
  database VARCHAR(50) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size_bytes BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Restore history
CREATE TABLE IF NOT EXISTS restore_history (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  source_db VARCHAR(50),
  target_db VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default admin (password: backup123)
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2a$10$rQEYqZJqZJqZJqZJqZJqZOeGqZJqZJqZJqZJqZJqZJqZJqZJqZJq', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default settings
INSERT INTO settings (key, value) VALUES 
  ('cron_schedule', '0 3 * * *'),
  ('retention_days', '30'),
  ('backup_dir', '/data/workspace/backups')
ON CONFLICT (key) DO NOTHING;

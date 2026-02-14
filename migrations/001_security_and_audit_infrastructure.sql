-- Migration: Add Security & Audit Infrastructure
-- Created: 2024
-- Description: Adds 2FA support, audit logging, and connector infrastructure

-- Add 2FA columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255),
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB;

-- Create audit_logs table for compliance and debugging
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  status VARCHAR(50),
  status_code INTEGER,
  details JSONB,
  error TEXT,
  ip_address INET,
  user_agent TEXT,
  duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, created_at DESC);

-- Create connectors table for data source configuration
CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'postgresql', 'snowflake', 'google_sheets', 'bigquery'
  config_json JSONB NOT NULL, -- Encrypted credentials stored here
  is_test_connection BOOLEAN DEFAULT FALSE,
  last_tested_at TIMESTAMP,
  test_status VARCHAR(50),
  test_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connectors_user ON connectors(user_id);
CREATE INDEX IF NOT EXISTS idx_connectors_org ON connectors(organization_id);
CREATE INDEX IF NOT EXISTS idx_connectors_type ON connectors(type);

-- Create CSRF token store (alternative to in-memory)
CREATE TABLE IF NOT EXISTS csrf_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) NOT NULL UNIQUE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csrf_tokens_session ON csrf_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_csrf_tokens_expires ON csrf_tokens(expires_at);

-- Create cell execution history for notebook auditing
CREATE TABLE IF NOT EXISTS cell_execution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id UUID,
  notebook_id UUID,
  code TEXT NOT NULL,
  output JSONB,
  status VARCHAR(50) NOT NULL, -- 'success', 'error', 'timeout'
  error TEXT,
  execution_time_ms INTEGER,
  memory_used_mb INTEGER,
  cpu_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cell_execution_history_cell ON cell_execution_history(cell_id);
CREATE INDEX IF NOT EXISTS idx_cell_execution_history_notebook ON cell_execution_history(notebook_id);
CREATE INDEX IF NOT EXISTS idx_cell_execution_history_status ON cell_execution_history(status);
CREATE INDEX IF NOT EXISTS idx_cell_execution_history_created ON cell_execution_history(created_at DESC);

-- Create templates table for pre-built analysis workflows
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- 'data_cleaning', 'statistical_analysis', 'forecasting', etc.
  difficulty VARCHAR(50), -- 'beginner', 'intermediate', 'advanced'
  estimated_time INTEGER, -- Minutes
  tags TEXT[], -- Array of tags
  cells_json JSONB NOT NULL, -- Template cells
  is_system_template BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_system ON templates(is_system_template);
CREATE INDEX IF NOT EXISTS idx_templates_public ON templates(is_public);
CREATE INDEX IF NOT EXISTS idx_templates_featured ON templates(is_featured);

-- Grant permissions for audit logging (for background jobs/services)
GRANT SELECT, INSERT ON audit_logs TO postgres;
GRANT SELECT, INSERT ON connectors TO postgres;
GRANT SELECT, INSERT, UPDATE ON templates TO postgres;

-- Vacuum analyze to update statistics
VACUUM ANALYZE audit_logs;
VACUUM ANALYZE connectors;
VACUUM ANALYZE csrf_tokens;
VACUUM ANALYZE cell_execution_history;
VACUUM ANALYZE templates;

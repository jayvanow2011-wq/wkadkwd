-- ============================================================================
-- NEON COMPLETE DATABASE SCHEMA
-- All tables with proper columns, indexes, and relationships
-- ============================================================================

-- ============================================================================
-- 1. AUTH TABLES (Already exist in neon_auth schema)
-- ============================================================================
-- user, account, session, verification, organization, member, invitation, jwks, project_config

-- ============================================================================
-- 2. PUBLIC SCHEMA - APPLICATION TABLES
-- ============================================================================

-- User Profiles & Roles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.user(id) ON DELETE CASCADE,
  username VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  cover_url TEXT,
  bio TEXT,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_username (username)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role)
);

-- Device Management
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  device_name VARCHAR(255),
  device_type VARCHAR(100),
  device_model VARCHAR(255),
  device_os VARCHAR(100),
  device_os_version VARCHAR(100),
  device_browser VARCHAR(100),
  device_browser_version VARCHAR(100),
  ip_address VARCHAR(45),
  mac_address VARCHAR(17),
  serial_number VARCHAR(255),
  hardware_id VARCHAR(255),
  location VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_active BOOLEAN DEFAULT TRUE,
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_device_type (device_type),
  INDEX idx_last_seen (last_seen)
);

CREATE TABLE IF NOT EXISTS device_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  cpu_usage DECIMAL(5, 2),
  memory_usage DECIMAL(5, 2),
  disk_usage DECIMAL(5, 2),
  temperature DECIMAL(5, 2),
  battery_level DECIMAL(5, 2),
  network_speed DECIMAL(10, 2),
  uptime_seconds BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_device_id (device_id),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS device_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  accessed_by_user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  access_type VARCHAR(50),
  access_time TIMESTAMP DEFAULT NOW(),
  INDEX idx_device_id (device_id),
  INDEX idx_accessed_by (accessed_by_user_id)
);

CREATE TABLE IF NOT EXISTS device_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  permission_type VARCHAR(100),
  granted_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_device_id (device_id),
  INDEX idx_user_id (user_id)
);

-- Social Features
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  title VARCHAR(500),
  content TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_from_user (from_user_id),
  INDEX idx_to_user (to_user_id),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_1 (user_id_1),
  INDEX idx_user_2 (user_id_2)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_read (read)
);

-- Monetization
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  plan_type VARCHAR(50),
  status VARCHAR(50),
  amount DECIMAL(10, 2),
  billing_cycle VARCHAR(50),
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES auth.user(id) ON DELETE CASCADE,
  status VARCHAR(50),
  reward_amount DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_referrer (referrer_user_id),
  INDEX idx_referred (referred_user_id)
);

CREATE TABLE IF NOT EXISTS free_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  reward_type VARCHAR(100),
  amount DECIMAL(10, 2),
  claimed_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_claimed_at (claimed_at)
);

-- Infrastructure & Automation
CREATE TABLE IF NOT EXISTS builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  build_name VARCHAR(255),
  status VARCHAR(50),
  output TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  command_text TEXT NOT NULL,
  arguments JSONB,
  status VARCHAR(50),
  output TEXT,
  error_message TEXT,
  exit_code INTEGER,
  execution_time_ms INTEGER,
  executed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_executed_at (executed_at)
);

CREATE TABLE IF NOT EXISTS command_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  result_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_command_id (command_id)
);

CREATE TABLE IF NOT EXISTS build_server_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  server_name VARCHAR(255),
  server_url TEXT,
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS turn_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url TEXT NOT NULL,
  username VARCHAR(255),
  credential VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_server_url (server_url)
);

-- System & Admin
CREATE TABLE IF NOT EXISTS recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  code VARCHAR(255) NOT NULL UNIQUE,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_code (code)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  token VARCHAR(500),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.user(id) ON DELETE SET NULL,
  action VARCHAR(255),
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_key (key)
);

-- Content
CREATE TABLE IF NOT EXISTS bio_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  title VARCHAR(255),
  url TEXT,
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS client_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  share_code VARCHAR(100) UNIQUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_share_code (share_code)
);

CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE,
  session_token VARCHAR(500),
  device_info JSONB,
  ip_address VARCHAR(45),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS ad_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location VARCHAR(100),
  ad_content TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_active (active)
);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_server_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bio_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spots ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INSERT INITIAL DATA
-- ============================================================================

-- Insert ad spots
INSERT INTO ad_spots (location, ad_content) VALUES 
  ('top', 'Welcome to Veltrix!'),
  ('sidebar', 'Upgrade your plan')
ON CONFLICT DO NOTHING;

-- Insert app settings
INSERT INTO app_settings (key, value) VALUES 
  ('maintenance_mode', 'false'),
  ('max_devices_per_user', '10'),
  ('api_rate_limit', '1000')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================

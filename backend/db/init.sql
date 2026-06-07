-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(64),
  display_name VARCHAR(128),
  role VARCHAR(32) NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'lead', 'admin', 'designer')),
  is_active BOOLEAN DEFAULT true,
  download_restricted_until TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMP
);

-- Reference Lists table (angles, languages, etc.)
CREATE TABLE reference_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_type VARCHAR(32) NOT NULL CHECK (list_type IN ('angle', 'language')),
  value VARCHAR(64) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(list_type, value)
);

-- Creatives table
CREATE TABLE creatives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  short_id VARCHAR(16) UNIQUE NOT NULL,
  file_url TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  file_hash VARCHAR(64) UNIQUE NOT NULL,
  file_type VARCHAR(32) NOT NULL CHECK (file_type IN ('video', 'image')),
  mime_type VARCHAR(64),
  size_bytes BIGINT,
  duration_sec INT NULL,
  width INT,
  height INT,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL,
  preland VARCHAR(255) NULL,
  language VARCHAR(8) NULL,
  author_comment TEXT NULL,
  aggregated_status VARCHAR(32) NOT NULL DEFAULT 'new' CHECK (aggregated_status IN ('new', 'working', 'fading', 'dead')),
  is_archived BOOLEAN DEFAULT false,
  moderation_status VARCHAR(32) NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending_review', 'approved', 'rejected')),
  author_lifecycle_status VARCHAR(32) NOT NULL DEFAULT 'actual' CHECK (author_lifecycle_status IN ('actual', 'fading', 'not_running')),
  author_lifecycle_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMP NULL,
  moderation_comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Creative GEOs (M:N)
CREATE TABLE creative_geos (
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  geo_code VARCHAR(2) NOT NULL,
  PRIMARY KEY (creative_id, geo_code)
);

-- Creative Angles (M:N)
CREATE TABLE creative_angles (
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  angle VARCHAR(64) NOT NULL,
  PRIMARY KEY (creative_id, angle)
);

-- Creative Statuses
CREATE TABLE creative_statuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  geo_code VARCHAR(2) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('testing', 'working', 'fading', 'dead', 'resurrected')),
  test_volume VARCHAR(32) NULL CHECK (test_volume IN ('quick', 'decent', 'heavy')),
  roi_category VARCHAR(32) NULL CHECK (roi_category IN ('green', 'yellow', 'red')),
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(creative_id, buyer_id, geo_code)
);

-- Downloads log
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip INET NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Bookmarks
CREATE TABLE bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, creative_id)
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  geo_code VARCHAR(2) NULL,
  angle VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, geo_code, angle)
);

-- Presets
CREATE TABLE presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  geo_codes TEXT[] NOT NULL,
  angles TEXT[] NOT NULL,
  language VARCHAR(8) NULL,
  preland VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notification Settings
CREATE TABLE notification_settings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  PRIMARY KEY (user_id, type)
);

-- Admin Settings
CREATE TABLE admin_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32),
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_creatives_aggregated_status ON creatives(aggregated_status);
CREATE INDEX idx_creatives_is_archived_created_at ON creatives(is_archived, created_at DESC);
CREATE INDEX idx_creatives_moderation_status_created_at ON creatives(moderation_status, created_at DESC);
CREATE INDEX idx_creatives_author_lifecycle_due ON creatives(author_lifecycle_status, author_lifecycle_updated_at);
CREATE INDEX idx_creative_geos_geo_code ON creative_geos(geo_code);
CREATE INDEX idx_creative_angles_angle ON creative_angles(angle);
CREATE INDEX idx_creative_statuses_buyer_updated_at ON creative_statuses(buyer_id, updated_at DESC);
CREATE INDEX idx_downloads_user_created_at ON downloads(user_id, created_at DESC);
CREATE INDEX idx_subscriptions_geo_angle ON subscriptions(geo_code, angle);
CREATE INDEX idx_creatives_author_id ON creatives(author_id);
CREATE INDEX idx_creatives_file_hash ON creatives(file_hash);
CREATE INDEX idx_comments_creative_id ON comments(creative_id);
CREATE INDEX idx_notifications_user_created_at ON notifications(user_id, created_at DESC);

-- Insert default angles
INSERT INTO reference_lists (list_type, value, is_active, sort_order) VALUES
  ('angle', 'sugar', true, 1),
  ('angle', 'mature', true, 2),
  ('angle', 'casual', true, 3),
  ('angle', 'MILF', true, 4),
  ('angle', 'asian', true, 5),
  ('angle', 'серйозні стосунки', true, 6),
  ('angle', 'swinger', true, 7);

-- Insert default languages
INSERT INTO reference_lists (list_type, value, is_active, sort_order) VALUES
  ('language', 'en', true, 1),
  ('language', 'de', true, 2),
  ('language', 'uk', true, 3),
  ('language', 'ru', true, 4);

INSERT INTO admin_settings (key, value) VALUES
  ('negative_status_threshold', '3'::jsonb),
  ('negative_status_window_days', '14'::jsonb),
  ('download_reminder_days', '14'::jsonb),
  ('download_restriction_days', '14'::jsonb),
  ('auto_archive_dead_days', '30'::jsonb),
  ('optional_metadata_reminder_days', '7'::jsonb),
  ('author_lifecycle_reminder_days', '14'::jsonb),
  ('moderation_enabled', 'false'::jsonb);

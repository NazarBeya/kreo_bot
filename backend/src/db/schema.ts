import { query } from './pool.js';
import { logger } from '../logger.js';

const defaultReferenceItems = [
  ['angle', 'sugar', 1],
  ['angle', 'mature', 2],
  ['angle', 'casual', 3],
  ['angle', 'MILF', 4],
  ['angle', 'asian', 5],
  ['angle', 'серйозні стосунки', 6],
  ['angle', 'swinger', 7],
  ['language', 'en', 1],
  ['language', 'de', 2],
  ['language', 'uk', 3],
  ['language', 'ru', 4],
] as const;

const defaultAdminSettings = [
  ['negative_status_threshold', 3],
  ['negative_status_window_days', 14],
  ['download_reminder_days', 14],
  ['download_restriction_days', 14],
  ['auto_archive_dead_days', 30],
  ['optional_metadata_reminder_days', 7],
  ['author_lifecycle_reminder_days', 14],
  ['moderation_enabled', false],
] as const;

const updateCheckConstraint = async (table: string, constraint: string, definition: string) => {
  await query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
  await query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${definition})`);
};

export const ensureOperationalSchema = async () => {
  await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await query('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      telegram_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(64),
      display_name VARCHAR(128),
      role VARCHAR(32) NOT NULL DEFAULT 'buyer',
      is_active BOOLEAN DEFAULT true,
      download_restricted_until TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_active_at TIMESTAMP
    )
  `);
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS download_restricted_until TIMESTAMP NULL');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP NULL');
  await updateCheckConstraint('users', 'users_role_check', "role IN ('buyer', 'lead', 'admin', 'designer')");

  await query(`
    CREATE TABLE IF NOT EXISTS reference_lists (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      list_type VARCHAR(32) NOT NULL,
      value VARCHAR(64) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      sort_order INT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(list_type, value)
    )
  `);
  await updateCheckConstraint('reference_lists', 'reference_lists_list_type_check', "list_type IN ('angle', 'language')");

  await query(`
    CREATE TABLE IF NOT EXISTS creatives (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      short_id VARCHAR(16) UNIQUE NOT NULL,
      file_url TEXT NOT NULL,
      preview_url TEXT NOT NULL,
      file_hash VARCHAR(64) UNIQUE NOT NULL,
      file_type VARCHAR(32) NOT NULL,
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
      aggregated_status VARCHAR(32) NOT NULL DEFAULT 'new',
      is_archived BOOLEAN DEFAULT false,
      moderation_status VARCHAR(32) NOT NULL DEFAULT 'approved',
      author_lifecycle_status VARCHAR(32) NOT NULL DEFAULT 'actual',
      author_lifecycle_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      moderated_at TIMESTAMP NULL,
      moderation_comment TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS parent_creative_id UUID REFERENCES creatives(id) ON DELETE SET NULL');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS preland VARCHAR(255) NULL');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS language VARCHAR(8) NULL');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS author_comment TEXT NULL');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(32) NOT NULL DEFAULT \'approved\'');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS author_lifecycle_status VARCHAR(32) NOT NULL DEFAULT \'actual\'');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS author_lifecycle_updated_at TIMESTAMP NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP NULL');
  await query('ALTER TABLE creatives ADD COLUMN IF NOT EXISTS moderation_comment TEXT NULL');
  await updateCheckConstraint('creatives', 'creatives_file_type_check', "file_type IN ('video', 'image')");
  await updateCheckConstraint('creatives', 'creatives_aggregated_status_check', "aggregated_status IN ('new', 'working', 'fading', 'dead')");
  await updateCheckConstraint('creatives', 'creatives_moderation_status_check', "moderation_status IN ('pending_review', 'approved', 'rejected')");
  await updateCheckConstraint('creatives', 'creatives_author_lifecycle_status_check', "author_lifecycle_status IN ('actual', 'fading', 'not_running')");

  await query(`
    CREATE TABLE IF NOT EXISTS creative_geos (
      creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
      geo_code VARCHAR(2) NOT NULL,
      PRIMARY KEY (creative_id, geo_code)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS creative_angles (
      creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
      angle VARCHAR(64) NOT NULL,
      PRIMARY KEY (creative_id, angle)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS creative_statuses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
      buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      geo_code VARCHAR(2) NOT NULL,
      status VARCHAR(32) NOT NULL,
      test_volume VARCHAR(32) NULL,
      roi_category VARCHAR(32) NULL,
      comment TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(creative_id, buyer_id, geo_code)
    )
  `);
  await updateCheckConstraint('creative_statuses', 'creative_statuses_status_check', "status IN ('testing', 'working', 'fading', 'dead', 'resurrected')");
  await updateCheckConstraint('creative_statuses', 'creative_statuses_test_volume_check', "test_volume IN ('quick', 'decent', 'heavy')");
  await updateCheckConstraint('creative_statuses', 'creative_statuses_roi_category_check', "roi_category IN ('green', 'yellow', 'red')");

  await query(`
    CREATE TABLE IF NOT EXISTS downloads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip INET NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, creative_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      geo_code VARCHAR(2) NULL,
      angle VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, geo_code, angle)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS presets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(64) NOT NULL,
      geo_codes TEXT[] NOT NULL,
      angles TEXT[] NOT NULL,
      language VARCHAR(8) NULL,
      preland VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(64) NOT NULL,
      is_enabled BOOLEAN DEFAULT true,
      PRIMARY KEY (user_id, type)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(64) NOT NULL,
      target_type VARCHAR(32),
      target_id UUID,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_creatives_aggregated_status ON creatives(aggregated_status)');
  await query('CREATE INDEX IF NOT EXISTS idx_creatives_is_archived_created_at ON creatives(is_archived, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_creatives_moderation_status_created_at ON creatives(moderation_status, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_creatives_author_lifecycle_due ON creatives(author_lifecycle_status, author_lifecycle_updated_at)');
  await query('CREATE INDEX IF NOT EXISTS idx_creative_geos_geo_code ON creative_geos(geo_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_creative_angles_angle ON creative_angles(angle)');
  await query('CREATE INDEX IF NOT EXISTS idx_creative_statuses_buyer_updated_at ON creative_statuses(buyer_id, updated_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_downloads_user_created_at ON downloads(user_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_subscriptions_geo_angle ON subscriptions(geo_code, angle)');
  await query('CREATE INDEX IF NOT EXISTS idx_creatives_author_id ON creatives(author_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_creatives_file_hash ON creatives(file_hash)');
  await query('CREATE INDEX IF NOT EXISTS idx_comments_creative_id ON comments(creative_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON notifications(user_id, created_at DESC)');

  for (const [listType, value, sortOrder] of defaultReferenceItems) {
    await query(
      `INSERT INTO reference_lists (list_type, value, is_active, sort_order)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (list_type, value) DO NOTHING`,
      [listType, value, sortOrder]
    );
  }

  for (const [key, value] of defaultAdminSettings) {
    await query(
      `INSERT INTO admin_settings (key, value)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)]
    );
  }

  logger.info('Operational database schema is ready');
};

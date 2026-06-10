import { query } from '../db/pool.js';

const defaults: Record<string, number> = {
  negative_status_threshold: 3,
  negative_status_window_days: 14,
  download_reminder_days: 14,
  download_restriction_days: 14,
  auto_archive_dead_days: 30,
  optional_metadata_reminder_days: 7,
  author_lifecycle_reminder_days: 14,
};

const booleanDefaults: Record<string, boolean> = {
  moderation_enabled: true,
};

export const getNumericSetting = async (key: string): Promise<number> => {
  const result = await query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  const rawValue = result.rows[0]?.value;
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);

  return Number.isFinite(value) && value > 0 ? value : defaults[key] || 1;
};

export const getBooleanSetting = async (key: string): Promise<boolean> => {
  const result = await query('SELECT value FROM admin_settings WHERE key = $1', [key]);
  const rawValue = result.rows[0]?.value;

  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    return rawValue === 'true';
  }

  return booleanDefaults[key] ?? false;
};

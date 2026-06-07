import { query } from '../db/pool.js';
import type { User, UserRole } from '../types/domain.js';
import { logger } from '../logger.js';

export const getUserByTelegramId = async (telegramId: number): Promise<User | null> => {
  try {
    const result = await query(
      'SELECT id, telegram_id, username, display_name, role, is_active, created_at, last_active_at FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error(error, 'Error fetching user');
    throw error;
  }
};

export const authenticateUser = async (
  telegramId: number,
  username?: string,
  displayName?: string
): Promise<User | null> => {
  try {
    const result = await query(
      `UPDATE users 
       SET username = COALESCE($2, users.username),
           display_name = COALESCE($3, users.display_name),
           last_active_at = NOW()
       WHERE telegram_id = $1
       RETURNING id, telegram_id, username, display_name, role, is_active, created_at, last_active_at`,
      [telegramId, username, displayName]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error(error, 'Error authenticating user');
    throw error;
  }
};

export const getActiveUsers = async (): Promise<User[]> => {
  try {
    const result = await query(
      'SELECT id, telegram_id, username, display_name, role, is_active, created_at, last_active_at FROM users WHERE is_active = true ORDER BY created_at DESC'
    );
    return result.rows;
  } catch (error) {
    logger.error(error, 'Error fetching active users');
    throw error;
  }
};

export const isUserAdmin = (user: User): boolean => {
  return user.role === 'admin' || user.role === 'lead';
};

export const updateUserLastActive = async (userId: string): Promise<void> => {
  try {
    await query(
      'UPDATE users SET last_active_at = NOW() WHERE id = $1',
      [userId]
    );
  } catch (error) {
    logger.error(error, 'Error updating user last active');
    throw error;
  }
};

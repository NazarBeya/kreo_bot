import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { getUserByTelegramId, updateUserLastActive } from '../services/user.js';
import { validateTelegramInitData } from '../utils/crypto.js';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: any;
      telegramId?: number;
    }
  }
}

export const telegramAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const initData = req.headers['x-telegram-init-data'] as string;
    
    if (!initData) {
      return res.status(401).json({ error: 'No Telegram init data' });
    }

    if (config.telegram.botToken && !validateTelegramInitData(initData, config.telegram.botToken)) {
      return res.status(401).json({ error: 'Invalid Telegram initData signature' });
    }

    const data = new URLSearchParams(initData);
    const userJson = data.get('user');
    
    if (!userJson) {
      return res.status(401).json({ error: 'No user data in init data' });
    }

    const userData = JSON.parse(userJson);
    const telegramId = userData.id;

    const user = await getUserByTelegramId(telegramId);

    if (!user) {
      return res.status(403).json({ error: 'User is not whitelisted. Please contact the administrator.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'User account disabled' });
    }

    await updateUserLastActive(user.id);

    req.user = user;
    req.telegramId = telegramId;

    next();
  } catch (error) {
    logger.error(error, 'Telegram auth error');
    res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'lead') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    
    const user = await getUserByTelegramId(decoded.telegramId);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not valid or inactive' });
    }
    
    await updateUserLastActive(user.id);
    
    req.user = user;
    req.telegramId = user.telegram_id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

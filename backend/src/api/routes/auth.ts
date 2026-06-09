import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { logger } from '../../logger.js';
import { config } from '../../config.js';
import { authenticateUser } from '../../services/user.js';
import { validateTelegramInitData } from '../../utils/crypto.js';
import jwt from 'jsonwebtoken';

export const authRouter = Router();

authRouter.post('/verify', async (req: Request, res: Response) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ error: 'Missing initData' });
    }

    if (config.telegram.botToken && !validateTelegramInitData(initData, config.telegram.botToken)) {
      return res.status(401).json({ error: 'Invalid Telegram initData signature' });
    }

    const data = new URLSearchParams(initData);
    const userJson = data.get('user');

    if (!userJson) {
      return res.status(400).json({ error: 'No user data in initData' });
    }

    const userData = JSON.parse(userJson);
    const displayName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || undefined;
    const user = await authenticateUser(userData.id, userData.username, displayName);

    if (!user) {
      return res.status(403).json({ error: 'User is not whitelisted. Please contact the administrator.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'User account is disabled' });
    }

    const token = jwt.sign(
      { id: user.id, telegramId: user.telegram_id, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      data: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        isActive: user.is_active,
      },
      token,
      message: 'Authentication successful',
    });
  } catch (error) {
    logger.error(error, 'Auth verification error');
    res.status(500).json({ error: 'Verification failed' });
  }
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    data: {
      id: req.user.id,
      telegramId: req.user.telegram_id,
      username: req.user.username,
      displayName: req.user.display_name,
      role: req.user.role,
      isActive: req.user.is_active,
      createdAt: req.user.created_at,
    },
  });
});

export default authRouter;

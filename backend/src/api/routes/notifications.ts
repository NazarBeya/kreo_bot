import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { query } from '../../db/pool.js';
import { scheduleReminder } from '../../services/notifications.js';
import { sanitizeString } from '../../utils/validation.js';
import { logger } from '../../logger.js';

export const notificationRouter = Router();

notificationRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const result = await query(
      `SELECT id, type, payload, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching notifications');
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

notificationRouter.post('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    logger.error(error, 'Error marking notification as read');
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

notificationRouter.post('/reminders', requireAuth, async (req: Request, res: Response) => {
  try {
    const text = sanitizeString(String(req.body.text || ''), 500);
    const runAt = new Date(req.body.runAt);

    if (!text || Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Valid text and future runAt are required' });
    }

    await scheduleReminder({ userId: req.user.id, text }, runAt);
    res.status(201).json({ message: 'Reminder scheduled' });
  } catch (error) {
    logger.error(error, 'Error scheduling reminder');
    res.status(500).json({ error: 'Failed to schedule reminder' });
  }
});

export default notificationRouter;

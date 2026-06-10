import { Router } from 'express';
import creativeRouter, { creativePreviewHandler } from './routes/creatives.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import statusRouter from './routes/status.js';
import notificationRouter from './routes/notifications.js';
import appDataRouter from './routes/app-data.js';
import { telegramAuth } from '../middleware/auth.js';

const router = Router();

router.use('/auth', authRouter);
router.get('/creatives/:id/preview', creativePreviewHandler);
router.use('/admin', telegramAuth, adminRouter);
router.use('/creatives', telegramAuth, creativeRouter);
router.use('/status', telegramAuth, statusRouter);
router.use('/notifications', telegramAuth, notificationRouter);
router.use('/app', telegramAuth, appDataRouter);

export default router;

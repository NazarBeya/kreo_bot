import { createApp, installErrorHandlers } from './api/app.js';
import apiRouter from './api/index.js';
import { bot } from './bot/index.js';
import { config } from './config.js';
import { ensureOperationalSchema } from './db/schema.js';
import { logger } from './logger.js';
import { startNotificationWorker, stopNotificationWorker } from './services/notifications.js';
import { startStatusWorker, stopStatusWorker } from './services/status.js';

const app = createApp();

app.use('/api', apiRouter);
installErrorHandlers(app);

const startServer = async () => {
  try {
    await ensureOperationalSchema();

    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`📡 API server started on http://0.0.0.0:${config.port}`);
      logger.info(`📍 Environment: ${config.env}`);
      logger.info(`🤖 Bot: @${config.telegram.botUsername}`);
    });

    startNotificationWorker();
    startStatusWorker();

    const hasRealBotToken =
      config.telegram.botToken && !config.telegram.botToken.startsWith('your_');

    if (hasRealBotToken) {
      logger.info('🤖 Starting Telegram bot...');
      await bot.start({
        onStart: () => {
          logger.info(`✅ Bot started as @${config.telegram.botUsername}`);
        },
      });
    } else {
      logger.warn('Telegram bot polling skipped: TELEGRAM_BOT_TOKEN is not configured');
    }

    process.on('SIGINT', async () => {
      logger.info('Shutting down gracefully...');
      stopNotificationWorker();
      stopStatusWorker();
      if (hasRealBotToken) {
        await bot.stop();
      }
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error(error, '❌ Failed to start server');
    process.exit(1);
  }
};

startServer();

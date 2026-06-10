import { createApp, installErrorHandlers } from './api/app.js';
import apiRouter from './api/index.js';
import { bot, setupBotMenu } from './bot/index.js';
import { activateTelegramWebhook, mountTelegramWebhook, useProductionWebhook } from './bot/webhook.js';
import { config } from './config.js';
import { ensureOperationalSchema } from './db/schema.js';
import { logger } from './logger.js';
import { startNotificationWorker, stopNotificationWorker } from './services/notifications.js';
import { startStatusWorker, stopStatusWorker } from './services/status.js';

const app = createApp();

const hasRealBotToken =
  config.telegram.botToken && !config.telegram.botToken.startsWith('your_');

if (hasRealBotToken && useProductionWebhook()) {
  mountTelegramWebhook(app, bot);
}

app.use('/api', apiRouter);
installErrorHandlers(app);

const startServer = async () => {
  try {
    await ensureOperationalSchema();

    const server = app.listen(config.port, '0.0.0.0', async () => {
      logger.info(`📡 API server started on http://0.0.0.0:${config.port}`);
      logger.info(`📍 Environment: ${config.env}`);
      logger.info(`🤖 Bot: @${config.telegram.botUsername}`);
      logger.info(`🌐 MINI_APP_URL: ${config.miniAppUrl}`);
      logger.info(`🔗 API_URL: ${config.apiUrl}`);
      if (config.env === 'production' && !config.miniAppUrl.startsWith('https://')) {
        logger.warn('MINI_APP_URL is not HTTPS — bot buttons and Mini App links will not work');
      }

      if (!hasRealBotToken) {
        logger.warn('Telegram bot skipped: TELEGRAM_BOT_TOKEN is not configured');
        return;
      }

      try {
        await setupBotMenu();

        if (useProductionWebhook()) {
          const webhookUrl = await activateTelegramWebhook(bot);
          logger.info(`✅ Bot webhook active: ${webhookUrl}`);
        } else {
          logger.info('🤖 Starting Telegram bot polling...');
          void bot.start({
            onStart: () => {
              logger.info(`✅ Bot polling active as @${config.telegram.botUsername}`);
            },
          });
        }
      } catch (error) {
        logger.error(error, 'Failed to start Telegram bot');
      }
    });

    startNotificationWorker();
    startStatusWorker();

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully...');
      stopNotificationWorker();
      stopStatusWorker();
      if (hasRealBotToken && !useProductionWebhook()) {
        await bot.stop();
      }
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (error) {
    logger.error(error, '❌ Failed to start server');
    process.exit(1);
  }
};

startServer();

import { createApp, installErrorHandlers } from './api/app.js';
import apiRouter from './api/index.js';
import { bot, setupBotMenu } from './bot/index.js';
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

    let botPollingActive = false;

    const startBotPolling = async () => {
      while (botPollingActive) {
        try {
          logger.info('🤖 Starting Telegram bot...');
          await setupBotMenu();
          await bot.start({
            onStart: () => {
              logger.info(`✅ Bot started as @${config.telegram.botUsername}`);
            },
          });
        } catch (error: any) {
          if (!botPollingActive) {
            break;
          }

          const isPollingConflict =
            error?.error_code === 409 ||
            String(error?.message || '').includes('409');

          if (isPollingConflict) {
            logger.warn(
              'Telegram polling conflict — another instance may be running. Retrying in 15s...'
            );
            await new Promise((resolve) => setTimeout(resolve, 15000));
            continue;
          }

          logger.error(error, 'Telegram bot polling failed. Retrying in 30s...');
          await new Promise((resolve) => setTimeout(resolve, 30000));
        }
      }
    };

    if (hasRealBotToken) {
      botPollingActive = true;
      void startBotPolling();
    } else {
      logger.warn('Telegram bot polling skipped: TELEGRAM_BOT_TOKEN is not configured');
    }

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully...');
      botPollingActive = false;
      stopNotificationWorker();
      stopStatusWorker();
      if (hasRealBotToken) {
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

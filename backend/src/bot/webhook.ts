import { Bot, webhookCallback } from 'grammy';
import type { Express } from 'express';
import { config } from '../config.js';
import type { MyContext } from './conversations.js';

export const TELEGRAM_WEBHOOK_PATH = '/telegram/webhook';

export const useProductionWebhook = () =>
  config.env === 'production'
  && config.apiUrl.startsWith('https://')
  && Boolean(config.telegram.botToken);

export const mountTelegramWebhook = (app: Express, bot: Bot<MyContext>) => {
  app.use(TELEGRAM_WEBHOOK_PATH, webhookCallback(bot, 'express'));
};

export const activateTelegramWebhook = async (bot: Bot<MyContext>) => {
  const webhookUrl = `${config.apiUrl.replace(/\/$/, '')}${TELEGRAM_WEBHOOK_PATH}`;
  await bot.api.setWebhook(webhookUrl, { drop_pending_updates: false });
  return webhookUrl;
};

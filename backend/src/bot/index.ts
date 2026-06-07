import { Bot, InlineKeyboard, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { MyContext, uploadWizard, searchWizard } from './conversations.js';

export const bot = new Bot<MyContext>(config.telegram.botToken);

bot.use(session({
  initial: () => ({}),
}));

bot.use(conversations());
bot.use(createConversation(uploadWizard as any));
bot.use(createConversation(searchWizard as any));

bot.command('start', async (ctx) => {
  logger.info({ userId: ctx.from?.id }, 'User started bot');

  if (!config.miniAppUrl.startsWith('https://')) {
    logger.warn(
      { miniAppUrl: config.miniAppUrl },
      'Telegram Web App button disabled: MINI_APP_URL must use HTTPS'
    );
    await ctx.reply(
      'Creative Bot\n\nКаталог тимчасово недоступний. Налаштуйте MINI_APP_URL з HTTPS-адресою.'
    );
    return;
  }

  const keyboard = new InlineKeyboard().webApp('Відкрити каталог', config.miniAppUrl);
  await ctx.reply('Creative Bot\n\nВідкрийте каталог креативів кнопкою нижче.', {
    reply_markup: keyboard,
  });
});

bot.command('search', async (ctx) => {
  await ctx.conversation.enter('searchWizard');
});

bot.command('admin', async (ctx) => {
  if (!config.miniAppUrl.startsWith('https://')) {
    await ctx.reply('Адмін-дашборд тимчасово недоступний. MINI_APP_URL має бути HTTPS.');
    return;
  }

  const adminUrl = new URL(config.miniAppUrl);
  adminUrl.pathname = '/admin';
  const keyboard = new InlineKeyboard().webApp('Відкрити адмінку', adminUrl.toString());
  await ctx.reply('Адмін-дашборд', { reply_markup: keyboard });
});

bot.on(['message:photo', 'message:video', 'message:document'], async (ctx, next) => {
  const mediaGroupId = ctx.message.media_group_id;

  if (mediaGroupId) {
    if (!ctx.session.mediaGroup || ctx.session.mediaGroup.id !== mediaGroupId) {
      ctx.session.mediaGroup = { id: mediaGroupId, messages: [ctx.message] };
      
      setTimeout(async () => {
        try {
          await ctx.conversation.enter('uploadWizard');
        } catch (e) {
          logger.error(e, 'Error starting upload wizard for album');
        }
      }, 1500);
    } else {
      ctx.session.mediaGroup.messages.push(ctx.message);
    }
  } else {
    ctx.session.mediaGroup = undefined;
    await ctx.conversation.enter('uploadWizard');
  }
});

bot.on('message', (ctx) => {
  if (!ctx.message.text?.startsWith('/')) {
    ctx.reply('I only understand commands and media uploads. Send a photo/video or use /search.');
  }
});

bot.catch((err) => {
  logger.error(err, 'Bot error');
});

export default bot;

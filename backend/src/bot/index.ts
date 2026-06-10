import { Bot, InlineKeyboard, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { MyContext, searchWizard } from './conversations.js';
import { getUserByTelegramId } from '../services/user.js';
import { query } from '../db/pool.js';

export const bot = new Bot<MyContext>(config.telegram.botToken);

const uploadMiniAppUrl = () => `${config.miniAppUrl}?screen=upload`;

export const setupBotMenu = async () => {
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Головне меню' },
      { command: 'upload', description: 'Залити крео' },
      { command: 'search', description: 'Знайти крео' },
      { command: 'settings', description: 'Налаштування' },
      { command: 'admin', description: 'Адмін-панель (lead/admin)' },
      { command: 'help', description: 'Допомога' },
    ]);
    await bot.api.setChatMenuButton({
      menu_button: { type: 'commands' },
    });
  } catch (error) {
    logger.warn(error, 'Failed to update bot menu (non-fatal, bot will still run)');
  }
};

bot.use(session({
  initial: () => ({}),
}));

bot.use(conversations());
bot.use(createConversation(searchWizard as any));

const requireWhitelistedUser = async (ctx: MyContext) => {
  if (!ctx.from) {
    return null;
  }

  let user = await getUserByTelegramId(ctx.from.id);
  if (user && user.is_active) {
    return user;
  }

  try {
    const result = await query(
      `INSERT INTO users (telegram_id, username, display_name, role, is_active, last_active_at)
       VALUES ($1, $2, $3, 'buyer', true, NOW())
       ON CONFLICT (telegram_id) DO UPDATE
         SET username = COALESCE(EXCLUDED.username, users.username),
             display_name = COALESCE(EXCLUDED.display_name, users.display_name),
             is_active = true,
             last_active_at = NOW()
       RETURNING id, telegram_id, username, display_name, role, is_active, created_at, last_active_at`,
      [
        ctx.from.id,
        ctx.from.username || null,
        `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || null,
      ]
    );
    user = result.rows[0];
    await ctx.reply('✅ Доступ надано (test mode). Вітаємо!');
    return user;
  } catch (err) {
    logger.error(err, 'Error creating/activating user');
    await ctx.reply('❌ Помилка доступу, зверніться до адміна.');
    return null;
  }
};

const mainMenuKeyboard = () => {
  if (!config.miniAppUrl.startsWith('https://')) {
    return undefined;
  }

  return new InlineKeyboard()
    .webApp('📂 Каталог', config.miniAppUrl)
    .row()
    .webApp('📤 Залити крео', uploadMiniAppUrl())
    .text('🔎 Знайти крео', 'action:search')
    .row()
    .webApp('⚙️ Налаштування', `${config.miniAppUrl}?screen=profile`);
};

const uploadMiniAppKeyboard = () => {
  if (!config.miniAppUrl.startsWith('https://')) {
    return undefined;
  }

  return new InlineKeyboard().webApp('📱 Відкрити заливку', uploadMiniAppUrl());
};

bot.command('start', async (ctx) => {
  logger.info({ userId: ctx.from?.id }, 'User started bot');
  const user = await requireWhitelistedUser(ctx);
  if (!user) {
    return;
  }

  const keyboard = mainMenuKeyboard();
  if (keyboard) {
    await ctx.reply(
      'Привіт! Я бот команди для управління крео.\n\nОбери дію нижче або скористайся меню команд зліва.',
      { reply_markup: keyboard }
    );
  } else {
    await ctx.reply(
      'Привіт! Я бот команди для управління крео.\n\nСкористайся меню команд зліва.'
    );
  }
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    [
      'Доступні команди:',
      '/start — головне меню',
      '/upload — заливка в Mini App',
      '/search — пошук по ID, GEO або angle',
      '/settings — профіль і пуші в Mini App',
      '/admin — адмін-панель (lead/admin)',
    ].join('\n')
  );
});

bot.command('settings', async (ctx) => {
  const user = await requireWhitelistedUser(ctx);
  if (!user) {
    return;
  }

  if (!config.miniAppUrl.startsWith('https://')) {
    await ctx.reply(
      '⚠️ Mini App недоступний: на бекенді не налаштовано MINI_APP_URL з HTTPS.\n\n' +
      'Адміну Render: Environment → MINI_APP_URL=https://creative-bot-frontend.onrender.com'
    );
    return;
  }

  const settingsUrl = new URL(config.miniAppUrl);
  settingsUrl.searchParams.set('screen', 'profile');
  await ctx.reply('Відкрий налаштування в Mini App:', {
    reply_markup: new InlineKeyboard().webApp('⚙️ Налаштування', settingsUrl.toString()),
  });
});

bot.command('upload', async (ctx) => {
  const user = await requireWhitelistedUser(ctx);
  if (!user) {
    return;
  }

  const keyboard = uploadMiniAppKeyboard();
  if (!keyboard) {
    await ctx.reply('Mini App недоступний: MINI_APP_URL має бути HTTPS.');
    return;
  }

  await ctx.reply('Заливка крео — тільки через Mini App:', { reply_markup: keyboard });
});

bot.command('search', async (ctx) => {
  const user = await requireWhitelistedUser(ctx);
  if (!user) {
    return;
  }

  await ctx.conversation.enter('searchWizard');
});

bot.command('admin', async (ctx) => {
  const user = await requireWhitelistedUser(ctx);
  if (!user) {
    return;
  }

  if (config.env === 'production' && !config.miniAppUrl.startsWith('https://')) {
    await ctx.reply('Адмін-дашборд тимчасово недоступний. MINI_APP_URL має бути HTTPS у production.');
    return;
  }

  const adminUrl = new URL(config.miniAppUrl);
  adminUrl.pathname = '/admin';
  const keyboard = new InlineKeyboard().webApp('Відкрити адмінку', adminUrl.toString());
  await ctx.reply('Адмін-дашборд', { reply_markup: keyboard });
});

bot.callbackQuery('action:search', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('searchWizard');
});

bot.callbackQuery(/^lc:([^:]+):(actual|fading|not_running)$/, async (ctx) => {
  const [, creativeId, lifecycleStatus] = ctx.match;
  const mappedStatus = lifecycleStatus === 'actual'
    ? 'working'
    : lifecycleStatus === 'fading'
      ? 'fading'
      : 'dead';
  const user = ctx.from ? await getUserByTelegramId(ctx.from.id) : null;

  if (!user || !user.is_active) {
    await ctx.answerCallbackQuery({ text: 'Немає доступу', show_alert: true });
    return;
  }

  const creativeResult = await query(
    `UPDATE creatives
     SET author_lifecycle_status = $1,
         author_lifecycle_updated_at = NOW(),
         aggregated_status = $2,
         updated_at = NOW()
     WHERE id = $3 AND author_id = $4
     RETURNING id, short_id, author_lifecycle_status, aggregated_status`,
    [lifecycleStatus, mappedStatus, creativeId, user.id]
  );

  if (creativeResult.rows.length === 0) {
    await ctx.answerCallbackQuery({ text: 'Крео не знайдено або це не твій файл', show_alert: true });
    return;
  }

  await query(
    `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
     VALUES ($1, 'author_lifecycle_update', 'creative', $2, $3)`,
    [
      user.id,
      creativeId,
      JSON.stringify({
        source: 'telegram_button',
        author_lifecycle_status: lifecycleStatus,
        aggregated_status: mappedStatus,
      }),
    ]
  );

  const label = lifecycleStatus === 'actual'
    ? 'актуальний'
    : lifecycleStatus === 'fading'
      ? 'вигорає'
      : 'вже не лию';

  await ctx.answerCallbackQuery({ text: `Оновлено: ${label}` });
  await ctx.editMessageText(`Статус ${creativeResult.rows[0].short_id} оновлено: ${label}`);
});

bot.on(['message:photo', 'message:video', 'message:document'], async (ctx) => {
  const user = await requireWhitelistedUser(ctx);
  if (!user) {
    return;
  }

  const keyboard = uploadMiniAppKeyboard();
  await ctx.reply(
    'Заливка файлів у чат вимкнена. Відкрий Mini App, щоб залити крео.',
    keyboard ? { reply_markup: keyboard } : undefined,
  );
});

bot.on('message', (ctx) => {
  if (!ctx.message.text?.startsWith('/')) {
    ctx.reply('Я розумію команди. Скористайся /help або меню зліва.');
  }
});

bot.catch((err) => {
  logger.error(err, 'Bot error');
});

export default bot;

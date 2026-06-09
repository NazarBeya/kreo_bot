import { Bot, InlineKeyboard, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { MyContext, uploadWizard, searchWizard } from './conversations.js';
import { findOrCreateUser, getUserByTelegramId } from '../services/user.js';
import { createTelegramUploadSession, TelegramUploadSessionFile } from '../services/telegram-upload-session.js';
import { query } from '../db/pool.js';

export const bot = new Bot<MyContext>(config.telegram.botToken);

export const setupBotMenu = async () => {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Відкрити каталог' },
    { command: 'search', description: 'Пошук креативів' },
    { command: 'admin', description: 'Адмін-панель' },
  ]);
  await bot.api.setChatMenuButton({
    menu_button: { type: 'commands' },
  });
};

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

const mediaToSessionFile = (message: any): TelegramUploadSessionFile | null => {
  if (message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    return {
      fileId: photo.file_id,
      fileName: `photo-${message.message_id}.jpg`,
      fileType: 'image',
      mimeType: 'image/jpeg',
      size: photo.file_size,
    };
  }

  if (message.video) {
    return {
      fileId: message.video.file_id,
      fileName: message.video.file_name || `video-${message.message_id}.mp4`,
      fileType: 'video',
      mimeType: message.video.mime_type,
      size: message.video.file_size,
    };
  }

  if (message.document) {
    const mimeType = message.document.mime_type || 'application/octet-stream';
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name || `document-${message.message_id}`,
      fileType: mimeType.startsWith('video/') ? 'video' : 'document',
      mimeType,
      size: message.document.file_size,
    };
  }

  return null;
};

const openUploadMiniApp = async (ctx: MyContext, messages: any[]) => {
  if (!ctx.from) {
    return;
  }

  const displayName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || undefined;
  const user = await findOrCreateUser(ctx.from.id, ctx.from.username, displayName);

  if (!user.is_active) {
    await ctx.reply('Access denied. Please contact the administrator.');
    return;
  }

  if (!config.miniAppUrl.startsWith('https://')) {
    await ctx.reply('Mini App upload недоступний: MINI_APP_URL має бути HTTPS.');
    return;
  }

  const files = messages.map(mediaToSessionFile).filter(Boolean) as TelegramUploadSessionFile[];

  if (files.length === 0) {
    await ctx.reply('Не бачу підтримуваних файлів для заливки.');
    return;
  }

  const session = await createTelegramUploadSession(ctx.from!.id, files);
  const uploadUrl = new URL(config.miniAppUrl);
  uploadUrl.searchParams.set('screen', 'upload');
  uploadUrl.searchParams.set('uploadSession', session.id);

  const keyboard = new InlineKeyboard().webApp(
    files.length > 1 ? `Відкрити батч (${files.length})` : 'Відкрити заливку',
    uploadUrl.toString()
  );

  await ctx.reply(
    files.length > 1
      ? `Отримав ${files.length} файлів. Відкрий Mini App, щоб виставити спільні metadata та overrides.`
      : 'Файл готовий до заливки через Mini App.',
    { reply_markup: keyboard }
  );
};

bot.on(['message:photo', 'message:video', 'message:document'], async (ctx, next) => {
  const mediaGroupId = ctx.message.media_group_id;

  if (mediaGroupId) {
    if (!ctx.session.mediaGroup || ctx.session.mediaGroup.id !== mediaGroupId) {
      ctx.session.mediaGroup = { id: mediaGroupId, messages: [ctx.message] };
      
      setTimeout(async () => {
        try {
          const group = ctx.session.mediaGroup;
          if (group?.id === mediaGroupId) {
            ctx.session.mediaGroup = undefined;
            await openUploadMiniApp(ctx, group.messages);
          }
        } catch (e) {
          logger.error(e, 'Error creating upload session for album');
        }
      }, 1500);
    } else {
      ctx.session.mediaGroup.messages.push(ctx.message);
    }
  } else {
    ctx.session.mediaGroup = undefined;
    await openUploadMiniApp(ctx, [ctx.message]);
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

import { ConversationFlavor } from '@grammyjs/conversations';
import { Context } from 'grammy';
import { searchCreatives, getCreativeByShortId } from '../services/creative.js';
import { getSignedUrl } from '../services/storage.js';

export type MyContext = Context & ConversationFlavor<Context> & {
  session: Record<string, never>;
};

export type MyConversation = any;

const knownGeos = ['DE', 'IL', 'PL', 'GB', 'US', 'FR', 'IT', 'AU', 'BR', 'ES'];

export async function searchWizard(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply('Введи ID (CR-XXXXX), GEO або angle. /cancel — скасувати.');
  const queryCtx = await conversation.wait();
  const text = queryCtx.message?.text?.trim();

  if (!text || text === '/cancel') {
    await ctx.reply('Пошук скасовано.');
    return;
  }

  let creatives: Awaited<ReturnType<typeof searchCreatives>>['creatives'] = [];

  if (/^CR-[A-Z0-9]+$/i.test(text)) {
    const creative = await getCreativeByShortId(text.toUpperCase());
    creatives = creative ? [creative] : [];
  } else {
    const isGeo = knownGeos.includes(text.toUpperCase());
    const result = await searchCreatives(
      isGeo ? [text.toUpperCase()] : undefined,
      isGeo ? undefined : [text],
      undefined,
      5,
      0,
      undefined,
      false,
      'newest',
      text
    );
    creatives = result.creatives;
  }

  if (creatives.length === 0) {
    await ctx.reply('Нічого не знайдено.');
    return;
  }

  for (const creative of creatives) {
    const shortId = creative.shortId || (creative as any).short_id;
    const geos = creative.geos?.join(', ') || '—';
    const angles = creative.angles?.join(', ') || '—';
    const status = creative.aggregatedStatus || (creative as any).aggregated_status;
    const caption = `🎬 *${shortId}*\n🌍 GEO: ${geos}\n🎯 Angle: ${angles}\n📊 Статус: ${status}`;
    const previewUrl = getSignedUrl((creative as any).preview_url || creative.previewUrl);

    try {
      await ctx.replyWithPhoto(previewUrl, { caption, parse_mode: 'Markdown', protect_content: true });
    } catch {
      await ctx.reply(caption, { protect_content: true });
    }
  }
}

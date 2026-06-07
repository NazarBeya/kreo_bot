import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context, InputFile } from 'grammy';
import { getUserByTelegramId } from '../services/user.js';
import { uploadCreativeMedia } from '../services/media.js';
import { searchCreatives, getCreativeByShortId } from '../services/creative.js';
import { getSignedUrl } from '../services/storage.js';
import { notifySubscribersAboutCreative } from '../services/notifications.js';
import { config } from '../config.js';

export type MyContext = Context & ConversationFlavor<Context> & {
  session: {
    mediaGroup?: {
      id: string;
      messages: any[];
    };
  };
};

export type MyConversation = any;

const knownGeos = ['DE', 'IL', 'PL', 'GB', 'US', 'FR', 'IT', 'AU', 'BR', 'ES'];
const knownAngles = ['sugar', 'mature', 'casual', 'MILF', 'asian', 'серйозні', 'swinger'];

const parseList = (value?: string) => value
  ? value.split(',').map((item) => item.trim()).filter(Boolean)
  : undefined;

const parseUploadOverride = (text?: string) => {
  if (!text || text.trim() === '/skip') {
    return {};
  }

  const values: Record<string, string> = {};
  const pattern = /(\w+)=("[^"]+"|'[^']+'|\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    values[match[1].toLowerCase()] = match[2].replace(/^["']|["']$/g, '');
  }

  return {
    geos: parseList(values.geo || values.geos)?.map((geo) => geo.toUpperCase()),
    angles: parseList(values.angle || values.angles),
    language: values.lang || values.language,
    preland: values.preland,
    authorComment: values.comment,
    parentShortId: values.parent?.toUpperCase(),
  };
};

const detectMetadataFromName = (name: string) => {
  const normalizedName = name.replace(/\.[^.]+$/, '').toLowerCase();
  const tokens = normalizedName.split(/[^a-z0-9а-яіїєґ]+/i).filter(Boolean);
  const geos = knownGeos.filter((geo) => tokens.includes(geo.toLowerCase()));
  const angles = knownAngles.filter((angle) => normalizedName.includes(angle.toLowerCase()));
  const parentShortId = name.match(/CR-[A-Z0-9]+/i)?.[0].toUpperCase();

  return {
    geos: geos.length ? geos : undefined,
    angles: angles.length ? angles : undefined,
    parentShortId,
  };
};

async function downloadTelegramFile(fileId: string, ctx: MyContext): Promise<Express.Multer.File> {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let mimetype = 'application/octet-stream';
  if (file.file_path?.endsWith('.jpg') || file.file_path?.endsWith('.jpeg')) mimetype = 'image/jpeg';
  else if (file.file_path?.endsWith('.png')) mimetype = 'image/png';
  else if (file.file_path?.endsWith('.mp4')) mimetype = 'video/mp4';

  return {
    buffer,
    mimetype,
    size: file.file_size || buffer.length,
    originalname: file.file_path?.split('/').pop() || 'upload',
    fieldname: 'file',
    encoding: '7bit',
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };
}

export async function uploadWizard(conversation: MyConversation, ctx: MyContext) {
  const user = await getUserByTelegramId(ctx.from!.id);
  if (!user || !user.is_active) {
    await ctx.reply("❌ Access denied. Please contact the administrator.");
    return;
  }

  const mediaMessages = ctx.session.mediaGroup ? ctx.session.mediaGroup.messages : [ctx.message];
  ctx.session.mediaGroup = undefined;

  await ctx.reply(`📁 Received ${mediaMessages.length} file(s). Let's set the metadata.\n\nEnter GEOs (comma-separated, e.g., US, DE):`);
  const geoCtx = await conversation.wait();
  const geos = geoCtx.message?.text?.split(',').map((g: string) => g.trim().toUpperCase()).filter(Boolean) || [];

  if (geos.length === 0) {
    await ctx.reply("❌ Invalid GEOs. Cancelled.");
    return;
  }

  await ctx.reply("Enter Angles (comma-separated, e.g., sugar, casual):");
  const angleCtx = await conversation.wait();
  const angles = angleCtx.message?.text?.split(',').map((a: string) => a.trim()).filter(Boolean) || [];

  if (angles.length === 0) {
    await ctx.reply("❌ Invalid Angles. Cancelled.");
    return;
  }

  await ctx.reply("Enter Language (optional, e.g., en, de) or send /skip:");
  const langCtx = await conversation.wait();
  const langText = langCtx.message?.text?.trim();
  const language = langText !== '/skip' ? langText : undefined;

  await ctx.reply("Enter shared preland (optional) or send /skip:");
  const prelandCtx = await conversation.wait();
  const prelandText = prelandCtx.message?.text?.trim();
  const preland = prelandText !== '/skip' ? prelandText : undefined;

  await ctx.reply("Enter shared author comment (optional) or send /skip:");
  const commentCtx = await conversation.wait();
  const commentText = commentCtx.message?.text?.trim();
  const authorComment = commentText !== '/skip' ? commentText : undefined;

  await ctx.reply("Processing uploads... Please wait ⏳");

  let uploadedCount = 0;
  for (const [index, msg] of mediaMessages.entries()) {
    let fileId: string | undefined;
    
    if (msg.photo && msg.photo.length > 0) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
    } else if (msg.video) {
      fileId = msg.video.file_id;
    } else if (msg.document) {
      fileId = msg.document.file_id;
    }

    if (!fileId) continue;

    try {
      const fileMock = await downloadTelegramFile(fileId, ctx);
      const detected = detectMetadataFromName(fileMock.originalname);
      await ctx.reply(
        [
          `File ${index + 1}/${mediaMessages.length}: ${fileMock.originalname}`,
          `Detected: ${(detected.geos || []).join(', ') || 'geo -'} · ${(detected.angles || []).join(', ') || 'angle -'}${detected.parentShortId ? ` · parent ${detected.parentShortId}` : ''}`,
          'Override? Send /skip or: geo=DE,PL angle=sugar preland=quiz lang=de comment="v2 strong hook" parent=CR-A7F3K',
        ].join('\n')
      );
      const overrideCtx = await conversation.wait();
      const override = parseUploadOverride(overrideCtx.message?.text?.trim());
      let parentCreativeId: string | undefined;
      const parentShortId = override.parentShortId || detected.parentShortId;

      if (parentShortId) {
        const parent = await getCreativeByShortId(parentShortId);
        parentCreativeId = parent?.id;
      }
      
      const result = await uploadCreativeMedia({
        file: fileMock,
        authorId: user.id,
        geos: override.geos?.length ? override.geos : detected.geos?.length ? detected.geos : geos,
        angles: override.angles?.length ? override.angles : detected.angles?.length ? detected.angles : angles,
        language: override.language || language,
        preland: override.preland || preland,
        authorComment: override.authorComment || authorComment,
        parentCreativeId,
      });

      if (!result.duplicate) {
        await notifySubscribersAboutCreative(result.creative);
      }

      await ctx.reply(`✅ Uploaded: ${result.creative.shortId} (Duplicate: ${result.duplicate ? 'Yes' : 'No'})`, {
        protect_content: true
      });
      uploadedCount++;
    } catch (e: any) {
      await ctx.reply(`❌ Failed to upload file: ${e.message}`);
    }
  }

  await ctx.reply(`🎉 Finished! Uploaded ${uploadedCount} files.`);
}

export async function searchWizard(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("Enter search query (GEO or Angle) or /cancel:");
  const queryCtx = await conversation.wait();
  const text = queryCtx.message?.text?.trim();

  if (!text || text === '/cancel') {
    await ctx.reply("Search cancelled.");
    return;
  }

  const { creatives } = await searchCreatives([text.toUpperCase()], [text], undefined, 5, 0);

  if (creatives.length === 0) {
    await ctx.reply("No creatives found.");
    return;
  }

  for (const creative of creatives) {
    const caption = `🎬 **${creative.shortId}**\n🌍 GEOs: ${creative.geos.join(', ')}\n🎯 Angles: ${creative.angles.join(', ')}\n📊 Status: ${creative.aggregatedStatus}`;
    
    try {
      if (creative.fileType === 'video') {
        await ctx.replyWithVideo(getSignedUrl(creative.fileUrl), { caption, parse_mode: 'Markdown', protect_content: true });
      } else {
        await ctx.replyWithPhoto(getSignedUrl(creative.fileUrl), { caption, parse_mode: 'Markdown', protect_content: true });
      }
    } catch (e) {
      await ctx.reply(caption + `\n\n🔗 [Download Link](${getSignedUrl(creative.fileUrl)})`, { parse_mode: 'Markdown', protect_content: true });
    }
  }
}

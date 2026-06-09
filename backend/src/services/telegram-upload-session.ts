import crypto from 'node:crypto';
import { config } from '../config.js';
import redis from '../db/redis.js';

export interface TelegramUploadSessionFile {
  fileId: string;
  fileName: string;
  mimeType?: string;
  fileType: 'image' | 'video' | 'document';
  size?: number;
}

export interface TelegramUploadSession {
  id: string;
  telegramId: number;
  files: TelegramUploadSessionFile[];
  createdAt: string;
}

const sessionTtlSeconds = 60 * 60;
const keyFor = (id: string) => `telegram-upload-session:${id}`;

export const createTelegramUploadSession = async (
  telegramId: number,
  files: TelegramUploadSessionFile[]
) => {
  const session: TelegramUploadSession = {
    id: crypto.randomUUID(),
    telegramId,
    files: files.slice(0, 50),
    createdAt: new Date().toISOString(),
  };

  await redis.set(keyFor(session.id), JSON.stringify(session), 'EX', sessionTtlSeconds);
  return session;
};

export const getTelegramUploadSession = async (id: string) => {
  const value = await redis.get(keyFor(id));
  return value ? JSON.parse(value) as TelegramUploadSession : null;
};

export const deleteTelegramUploadSession = async (id: string) => {
  await redis.del(keyFor(id));
};

const mimeFromPath = (path?: string, fallback?: string) => {
  if (fallback) return fallback;
  if (path?.match(/\.jpe?g$/i)) return 'image/jpeg';
  if (path?.match(/\.png$/i)) return 'image/png';
  if (path?.match(/\.webp$/i)) return 'image/webp';
  if (path?.match(/\.mp4$/i)) return 'video/mp4';
  if (path?.match(/\.mov$/i)) return 'video/quicktime';
  if (path?.match(/\.webm$/i)) return 'video/webm';
  return 'application/octet-stream';
};

export const downloadTelegramUploadFile = async (
  file: TelegramUploadSessionFile
): Promise<Express.Multer.File> => {
  const fileInfoResponse = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/getFile?file_id=${encodeURIComponent(file.fileId)}`
  );
  const fileInfo = await fileInfoResponse.json() as { ok: boolean; result?: { file_path?: string; file_size?: number } };

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error('Failed to resolve Telegram file');
  }

  const fileResponse = await fetch(`https://api.telegram.org/file/bot${config.telegram.botToken}/${fileInfo.result.file_path}`);
  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fallbackName = fileInfo.result.file_path.split('/').pop() || 'upload';

  return {
    buffer,
    mimetype: mimeFromPath(fileInfo.result.file_path, file.mimeType),
    size: fileInfo.result.file_size || file.size || buffer.length,
    originalname: file.fileName || fallbackName,
    fieldname: 'files',
    encoding: '7bit',
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };
};

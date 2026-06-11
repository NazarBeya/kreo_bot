import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { hashFile } from '../utils/crypto.js';
import { checkDuplicateHash, createCreative } from './creative.js';
import { ensureBucket, extractObjectKey, getObject, putObject, tryGetObject } from './storage.js';
import { logger } from '../logger.js';

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const videoMimeTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const execFileAsync = promisify(execFile);

export interface UploadCreativeInput {
  file: Express.Multer.File;
  authorId: string;
  geos: string[];
  angles: string[];
  language?: string;
  preland?: string;
  authorComment?: string;
  parentCreativeId?: string;
}

const escapeSvgText = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const getWatermarkText = (label: string) => label.slice(0, 64);

const createWatermarkSvg = (width: number, height: number, text: string) => {
  const fontSize = Math.max(22, Math.round(Math.min(width, height) / 18));
  const tileWidth = Math.max(220, Math.round(fontSize * (text.length + 8)));
  const tileHeight = Math.max(120, Math.round(fontSize * 4));

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="watermark" width="${tileWidth}" height="${tileHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <text x="${Math.round(fontSize * 0.8)}" y="${Math.round(tileHeight / 2)}"
                fill="#ffffff"
                fill-opacity="0.42"
                stroke="#000000"
                stroke-opacity="0.28"
                stroke-width="1"
                font-family="DejaVu Sans, Liberation Sans, sans-serif"
                font-size="${fontSize}"
                font-weight="700"
                letter-spacing="1">${escapeSvgText(text)}</text>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#watermark)" />
    </svg>
  `);
};

const generateImagePreviewBuffer = async (fileBuffer: Buffer) => (
  sharp(fileBuffer)
    .rotate()
    .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()
);

const generateVideoPreviewBuffer = async (fileBuffer: Buffer, mimeType: string) => {
  const ext = getExtension(mimeType);
  const tempDir = path.join(tmpdir(), `preview-${hashFile(fileBuffer).slice(0, 16)}`);
  const inputPath = path.join(tempDir, `input.${ext}`);
  const previewPath = path.join(tempDir, 'preview.webp');

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(inputPath, fileBuffer);

    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,duration:format=duration',
      '-of',
      'json',
      inputPath,
    ]);
    const probe = JSON.parse(stdout);
    const duration = Math.round(Number(probe.streams?.[0]?.duration || probe.format?.duration || 0)) || 0;

    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      duration > 2 ? '00:00:01' : '00:00:00',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=720:720:force_original_aspect_ratio=decrease',
      '-quality',
      '82',
      previewPath,
    ]);

    return await readFile(previewPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

export const resolveCreativePreviewBuffer = async (creative: {
  id: string;
  preview_url?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  mime_type?: string | null;
}): Promise<Buffer> => {
  if (creative.preview_url) {
    const previewBuffer = await tryGetObject(creative.preview_url);
    if (previewBuffer) {
      return previewBuffer;
    }

    logger.warn({ creativeId: creative.id }, 'Preview file missing, regenerating from original');
  }

  if (!creative.file_url) {
    const error = new Error('Creative file not found');
    (error as NodeJS.ErrnoException).code = 'CREATIVE_MEDIA_NOT_FOUND';
    throw error;
  }

  const originalBuffer = await tryGetObject(creative.file_url);
  if (!originalBuffer) {
    const error = new Error('Creative file not found');
    (error as NodeJS.ErrnoException).code = 'CREATIVE_MEDIA_NOT_FOUND';
    throw error;
  }
  const regenerated = creative.file_type === 'video'
    ? await generateVideoPreviewBuffer(originalBuffer, creative.mime_type || 'video/mp4')
    : await generateImagePreviewBuffer(originalBuffer);

  if (creative.preview_url) {
    try {
      const previewKey = extractObjectKey(creative.preview_url);
      await putObject({ key: previewKey, body: regenerated, contentType: 'image/webp' });
    } catch (healError) {
      logger.warn(healError, 'Failed to restore missing preview file');
    }
  }

  return regenerated;
};

export const applyWatermarkToPreview = async (preview: Buffer, watermarkText: string) => {
  const metadata = await sharp(preview).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read preview dimensions');
  }

  return sharp(preview)
    .composite([
      {
        input: createWatermarkSvg(metadata.width, metadata.height, watermarkText),
        blend: 'over',
      },
    ])
    .webp({ quality: 82 })
    .toBuffer();
};

const getExtension = (mimeType: string) => {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    case 'video/webm':
      return 'webm';
    default:
      return 'bin';
  }
};

export const uploadCreativeMedia = async (input: UploadCreativeInput) => {
  const fileHash = hashFile(input.file.buffer);
  const duplicate = await checkDuplicateHash(fileHash);

  if (duplicate) {
    return { creative: duplicate, duplicate: true };
  }

  if (imageMimeTypes.has(input.file.mimetype)) {
    return uploadImageCreative(input, fileHash);
  }

  if (videoMimeTypes.has(input.file.mimetype)) {
    return uploadVideoCreative(input, fileHash);
  }

  throw new Error('Unsupported creative file type');
};

const uploadImageCreative = async (input: UploadCreativeInput, fileHash: string) => {
  const image = sharp(input.file.buffer, { animated: input.file.mimetype === 'image/gif' });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  const ext = getExtension(input.file.mimetype);
  const folder = `creatives/${new Date().toISOString().slice(0, 10)}/${fileHash}`;
  const originalName = path.basename(input.file.originalname || `creative.${ext}`).replace(/[^\w.-]/g, '_');
  const fileKey = `${folder}/${originalName}`;
  const previewKey = `${folder}/preview.webp`;

  const preview = await sharp(input.file.buffer)
    .rotate()
    .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  await ensureBucket();

  const [fileUrl, previewUrl] = await Promise.all([
    putObject({ key: fileKey, body: input.file.buffer, contentType: input.file.mimetype }),
    putObject({ key: previewKey, body: preview, contentType: 'image/webp' }),
  ]);

  const creative = await createCreative({
    fileUrl,
    previewUrl,
    fileHash,
    fileType: 'image',
    mimeType: input.file.mimetype,
    sizeBytes: input.file.size,
    width: metadata.width,
    height: metadata.height,
    authorId: input.authorId,
    geos: input.geos,
    angles: input.angles,
    language: input.language,
    preland: input.preland,
    authorComment: input.authorComment,
    parentCreativeId: input.parentCreativeId,
  });

  return { creative, duplicate: false };
};

const uploadVideoCreative = async (input: UploadCreativeInput, fileHash: string) => {
  const ext = getExtension(input.file.mimetype);
  const folder = `creatives/${new Date().toISOString().slice(0, 10)}/${fileHash}`;
  const originalName = path.basename(input.file.originalname || `creative.${ext}`).replace(/[^\w.-]/g, '_');
  const fileKey = `${folder}/${originalName}`;
  const previewKey = `${folder}/preview.webp`;
  const tempDir = path.join(tmpdir(), `creative-${fileHash}`);
  const inputPath = path.join(tempDir, `input.${ext}`);
  const previewPath = path.join(tempDir, 'preview.webp');

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(inputPath, input.file.buffer);

    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,duration:format=duration',
      '-of',
      'json',
      inputPath,
    ]);
    const probe = JSON.parse(stdout);
    const stream = probe.streams?.[0] || {};
    const duration = Math.round(Number(stream.duration || probe.format?.duration || 0)) || undefined;

    if (!stream.width || !stream.height) {
      throw new Error('Unable to read video dimensions');
    }

    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      duration && duration > 2 ? '00:00:01' : '00:00:00',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=720:720:force_original_aspect_ratio=decrease',
      '-quality',
      '82',
      previewPath,
    ]);

    const preview = await readFile(previewPath);
    await ensureBucket();

    const [fileUrl, previewUrl] = await Promise.all([
      putObject({ key: fileKey, body: input.file.buffer, contentType: input.file.mimetype }),
      putObject({ key: previewKey, body: preview, contentType: 'image/webp' }),
    ]);

    const creative = await createCreative({
      fileUrl,
      previewUrl,
      fileHash,
      fileType: 'video',
      mimeType: input.file.mimetype,
      sizeBytes: input.file.size,
      durationSec: duration,
      width: Number(stream.width),
      height: Number(stream.height),
      authorId: input.authorId,
      geos: input.geos,
      angles: input.angles,
      language: input.language,
      preland: input.preland,
      authorComment: input.authorComment,
      parentCreativeId: input.parentCreativeId,
    });

    return { creative, duplicate: false };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

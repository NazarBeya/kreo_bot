import { Router, Request, Response } from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../../middleware/auth.js';
import { getCreativeByShortId, getCreativeVersionHistory, searchCreatives, getCreativeById, type CreativeSortMode } from '../../services/creative.js';
import { applyWatermarkToPreview, uploadCreativeMedia } from '../../services/media.js';
import { getObject } from '../../services/storage.js';
import { getViewerWatermarkLabel } from '../../services/user.js';
import { notifyCreativeDownloaded, notifySubscribersAboutCreative } from '../../services/notifications.js';
import { logger } from '../../logger.js';
import { isValidFileSize, isValidGeoCode, sanitizeString } from '../../utils/validation.js';
import { query } from '../../db/pool.js';
import { config } from '../../config.js';
import { getSignedUrl } from '../../services/storage.js';
import {
  deleteTelegramUploadSession,
  downloadTelegramUploadFile,
  getTelegramUploadSession,
} from '../../services/telegram-upload-session.js';

export const creativeRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 50,
  },
});

const parseList = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(parseList);
  }

  const text = String(value).trim();

  if (!text) {
    return [];
  }

  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
  }

  return text.split(',').map((item) => item.trim()).filter(Boolean);
};

const parseOptionalJsonArray = (value: unknown): Record<string, any>[] => {
  if (!value) {
    return [];
  }

  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
};

const uploadCreativeFromRequest = async (
  file: Express.Multer.File,
  userId: string,
  metadata: Record<string, any>
) => {
  if (!isValidFileSize(file.size, 100)) {
    throw Object.assign(new Error('Creative file is too large'), { statusCode: 413 });
  }

  const geos = parseList(metadata.geos).map((geo) => geo.toUpperCase());
  const angles = parseList(metadata.angles);

  if (geos.length === 0 || geos.some((geo) => !isValidGeoCode(geo))) {
    throw Object.assign(new Error('At least one valid GEO code is required'), { statusCode: 400 });
  }

  if (angles.length === 0) {
    throw Object.assign(new Error('At least one angle is required'), { statusCode: 400 });
  }

  let parentCreativeId = metadata.parentCreativeId
    ? sanitizeString(String(metadata.parentCreativeId), 64)
    : undefined;

  if (!parentCreativeId && metadata.parentShortId) {
    const parentResult = await query(
      'SELECT id FROM creatives WHERE short_id = $1 LIMIT 1',
      [sanitizeString(String(metadata.parentShortId), 16).toUpperCase()]
    );

    if (parentResult.rows.length === 0) {
      throw Object.assign(new Error('Parent creative not found'), { statusCode: 400 });
    }

    parentCreativeId = parentResult.rows[0].id;
  }

  const result = await uploadCreativeMedia({
    file,
    authorId: userId,
    geos,
    angles: angles.map((angle) => sanitizeString(angle, 64)),
    language: metadata.language ? sanitizeString(String(metadata.language), 8) : undefined,
    preland: metadata.preland ? sanitizeString(String(metadata.preland), 255) : undefined,
    authorComment: metadata.authorComment
      ? sanitizeString(String(metadata.authorComment), 2000)
      : undefined,
    parentCreativeId,
  });

  if (!result.duplicate && (result.creative as any).moderation_status === 'approved') {
    await notifySubscribersAboutCreative(result.creative);
  }

  return result;
};

// Test mode: Allow public access to catalog
creativeRouter.get('/', async (req: Request, res: Response) => {
  try {
    const geos = req.query.geos ? (req.query.geos as string).split(',') : undefined;
    const angles = req.query.angles ? (req.query.angles as string).split(',') : undefined;
    const status = req.query.status as any;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const archivedOnly = req.query.archived === 'true' || req.query.archived === '1';
    const sort = (['newest', 'confirmations', 'updated'].includes(String(req.query.sort))
      ? String(req.query.sort)
      : 'newest') as CreativeSortMode;
    const queryText = req.query.q ? String(req.query.q) : undefined;

    const authorId = req.user?.role === 'designer' ? req.user.id : undefined;

    const { creatives, total } = await searchCreatives(
      geos,
      angles,
      status,
      limit,
      offset,
      authorId,
      archivedOnly,
      sort,
      queryText
    );

    res.json({
      data: creatives,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    logger.error(error, 'Error searching creatives');
    res.status(500).json({ error: 'Failed to search creatives' });
  }
});

creativeRouter.patch('/:id/metadata', requireAuth, async (req: Request, res: Response) => {
  try {
    const creative = await getCreativeById(req.params.id);

    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    const authorId = creative.authorId || (creative as any).author_id;
    const canEdit = req.user.role === 'admin' || req.user.role === 'lead' || authorId === req.user.id;

    if (!canEdit) {
      return res.status(403).json({ error: 'Only author or admin can update creative metadata' });
    }

    const language = req.body.language !== undefined
      ? sanitizeString(String(req.body.language), 8) || null
      : undefined;
    const preland = req.body.preland !== undefined
      ? sanitizeString(String(req.body.preland), 255) || null
      : undefined;
    const authorComment = req.body.authorComment !== undefined || req.body.author_comment !== undefined
      ? sanitizeString(String(req.body.authorComment ?? req.body.author_comment), 2000) || null
      : undefined;

    const result = await query(
      `UPDATE creatives
       SET language = COALESCE($1, language),
           preland = COALESCE($2, preland),
           author_comment = COALESCE($3, author_comment),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, short_id, language, preland, author_comment, updated_at`,
      [language, preland, authorComment, req.params.id]
    );

    await query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
       VALUES ($1, 'metadata_update', 'creative', $2, $3)`,
      [
        req.user.id,
        req.params.id,
        JSON.stringify({
          language: language !== undefined,
          preland: preland !== undefined,
          author_comment: authorComment !== undefined,
        }),
      ]
    );

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error updating creative metadata');
    res.status(500).json({ error: 'Failed to update creative metadata' });
  }
});

creativeRouter.post('/:id/lifecycle', requireAuth, async (req: Request, res: Response) => {
  try {
    const lifecycleStatus = String(req.body.status || '');
    const mappedStatus = lifecycleStatus === 'actual'
      ? 'working'
      : lifecycleStatus === 'fading'
        ? 'fading'
        : lifecycleStatus === 'not_running'
          ? 'dead'
          : null;

    if (!mappedStatus) {
      return res.status(400).json({ error: 'status must be actual, fading or not_running' });
    }

    const creative = await getCreativeById(req.params.id);

    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    const authorId = creative.authorId || (creative as any).author_id;
    const canUpdate = req.user.role === 'admin' || req.user.role === 'lead' || authorId === req.user.id;

    if (!canUpdate) {
      return res.status(403).json({ error: 'Only author or admin can update lifecycle' });
    }

    const result = await query(
      `UPDATE creatives
       SET author_lifecycle_status = $1,
           author_lifecycle_updated_at = NOW(),
           aggregated_status = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, short_id, author_lifecycle_status, author_lifecycle_updated_at, aggregated_status`,
      [lifecycleStatus, mappedStatus, req.params.id]
    );

    await query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
       VALUES ($1, 'author_lifecycle_update', 'creative', $2, $3)`,
      [
        req.user.id,
        req.params.id,
        JSON.stringify({
          author_lifecycle_status: lifecycleStatus,
          aggregated_status: mappedStatus,
        }),
      ]
    );

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error updating creative lifecycle');
    res.status(500).json({ error: 'Failed to update creative lifecycle' });
  }
});

creativeRouter.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const creative = await getCreativeById(req.params.id);

    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    if (req.user?.role === 'designer') {
      const authorId = creative.authorId || (creative as any).author_id;
      if (authorId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const versions = await getCreativeVersionHistory(req.params.id);
    res.json({ data: versions });
  } catch (error) {
    logger.error(error, 'Error fetching creative versions');
    res.status(500).json({ error: 'Failed to fetch creative versions' });
  }
});

creativeRouter.post(
  '/',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Missing creative file' });
      }

      const result = await uploadCreativeFromRequest(req.file, req.user.id, req.body);

      res.status(result.duplicate ? 200 : 201).json({
        data: result.creative,
        duplicate: result.duplicate,
      });
    } catch (error: any) {
      logger.error(error, 'Error uploading creative');

      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid metadata JSON' });
      }

      if (error.message?.includes('Unsupported creative file type')) {
        return res.status(415).json({ error: error.message });
      }

      res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to upload creative' });
    }
  }
);

creativeRouter.post(
  '/bulk',
  requireAuth,
  upload.array('files', 50),
  async (req: Request, res: Response) => {
    try {
      let files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
      const telegramUploadSessionId = req.body.telegramUploadSessionId
        ? sanitizeString(String(req.body.telegramUploadSessionId), 80)
        : '';

      if (files.length === 0 && telegramUploadSessionId) {
        const session = await getTelegramUploadSession(telegramUploadSessionId);

        if (!session || String(session.telegramId) !== String(req.user.telegram_id)) {
          return res.status(404).json({ error: 'Upload session not found' });
        }

        files = await Promise.all(session.files.map(downloadTelegramUploadFile));
      }

      if (files.length === 0) {
        return res.status(400).json({ error: 'At least one creative file is required' });
      }

      if (files.length > 50) {
        return res.status(400).json({ error: 'Bulk upload supports up to 50 files' });
      }

      const overrides = parseOptionalJsonArray(req.body.overrides);
      const results = [];

      for (const [index, file] of files.entries()) {
        try {
          const override = overrides[index] || {};
          const metadata = {
            ...req.body,
            ...override,
            geos: override.geos && parseList(override.geos).length > 0 ? override.geos : req.body.geos,
            angles: override.angles && parseList(override.angles).length > 0 ? override.angles : req.body.angles,
            preland: override.preland !== undefined ? override.preland : req.body.preland,
            language: override.language !== undefined ? override.language : req.body.language,
            authorComment: override.authorComment !== undefined ? override.authorComment : req.body.authorComment,
            parentCreativeId: override.parentCreativeId !== undefined ? override.parentCreativeId : req.body.parentCreativeId,
            parentShortId: override.parentShortId !== undefined ? override.parentShortId : req.body.parentShortId,
          };
          const result = await uploadCreativeFromRequest(file, req.user.id, metadata);

          results.push({
            index,
            fileName: file.originalname,
            success: true,
            duplicate: result.duplicate,
            creative: result.creative,
          });
        } catch (error: any) {
          logger.error(error, 'Error uploading creative in bulk');
          results.push({
            index,
            fileName: file.originalname,
            success: false,
            error: error.message || 'Failed to upload creative',
          });
        }
      }

      const failed = results.filter((result) => !result.success).length;

      if (telegramUploadSessionId && failed === 0) {
        await deleteTelegramUploadSession(telegramUploadSessionId);
      }

      res.status(failed ? 207 : 201).json({
        data: results,
        summary: {
          total: files.length,
          succeeded: files.length - failed,
          failed,
        },
      });
    } catch (error: any) {
      logger.error(error, 'Error in POST /api/creatives/bulk');

      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid overrides JSON' });
      }

      res.status(500).json({ error: 'Failed to upload creatives' });
    }
  }
);

const resolvePreviewUser = async (req: Request) => {
  if (req.user) {
    return req.user;
  }

  const token = String(req.query.token || '');
  if (!token) {
    return null;
  }

  const decoded = jwt.verify(token, config.jwtSecret) as { telegramId: number };
  const result = await query(
    'SELECT id, telegram_id, username, display_name, role, is_active FROM users WHERE telegram_id = $1 LIMIT 1',
    [decoded.telegramId]
  );
  return result.rows[0] || null;
};

creativeRouter.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const viewer = await resolvePreviewUser(req);
    if (!viewer || !viewer.is_active) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    let creative = await getCreativeByShortId(id);
    if (!creative) {
      creative = await getCreativeById(id);
    }
    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    const previewSource = (creative as any).preview_url || creative.previewUrl;
    const previewBuffer = await getObject(previewSource);
    const watermark = getViewerWatermarkLabel(viewer);
    const watermarked = await applyWatermarkToPreview(previewBuffer, watermark);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(watermarked);
  } catch (error) {
    logger.error(error, 'Error generating watermarked preview');
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Test mode: Allow public access to creative context
creativeRouter.get('/:id/context', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let creative = await getCreativeByShortId(id);
    if (!creative) {
      creative = await getCreativeById(id);
    }
    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    const [downloadResult, statusResult] = await Promise.all([
      query(
        'SELECT id, created_at FROM downloads WHERE creative_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1',
        [creative.id, req.user.id]
      ),
      query(
        `SELECT geo_code, status, test_volume, roi_category, comment, updated_at
         FROM creative_statuses
         WHERE creative_id = $1 AND buyer_id = $2
         ORDER BY updated_at DESC`,
        [creative.id, req.user.id]
      ),
    ]);

    res.json({
      data: {
        hasDownloaded: downloadResult.rows.length > 0,
        downloadedAt: downloadResult.rows[0]?.created_at || null,
        myStatuses: statusResult.rows,
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching creative context');
    res.status(500).json({ error: 'Failed to fetch creative context' });
  }
});

// Test mode: Allow public access to view creative details
creativeRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let creative = await getCreativeByShortId(id);
    
    if (!creative) {
      creative = await getCreativeById(id);
    }

    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    // Test mode: Allow all users to view creatives (designer restrictions removed)
    // if (req.user?.role === 'designer' && (creative as any).author_id !== req.user.id && creative.authorId !== req.user.id) {
    //   return res.status(403).json({ error: 'Access denied to this creative' });
    // }

    res.json({ data: creative });
  } catch (error) {
    logger.error(error, 'Error fetching creative');
    res.status(500).json({ error: 'Failed to fetch creative' });
  }
});

creativeRouter.get('/:id/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (req.user?.download_restricted_until) {
      const restrictedUntil = new Date(req.user.download_restricted_until);
      if (restrictedUntil > new Date()) {
        return res.status(403).json({ 
          error: 'Downloads are restricted for this user until ' + restrictedUntil.toISOString() 
        });
      }
    }

    let creative = await getCreativeByShortId(id);
    if (!creative) {
      creative = await getCreativeById(id);
    }

    if (!creative) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    if (req.user?.role === 'designer' && (creative as any).author_id !== req.user.id && creative.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to download this creative' });
    }

    await query(
      `INSERT INTO downloads (creative_id, user_id, ip, user_agent) VALUES ($1, $2, $3, $4)`,
      [creative.id, req.user.id, req.ip || null, req.headers['user-agent'] || null]
    );

    try {
      await notifyCreativeDownloaded(creative, req.user);
    } catch (notificationError) {
      logger.error(notificationError, 'Error sending download notification');
    }

    const fileResult = await query('SELECT file_url FROM creatives WHERE id = $1', [creative.id]);
    const fileUrl = fileResult.rows[0]?.file_url || creative.fileUrl || (creative as any).file_url;

    res.json({
      url: getSignedUrl(fileUrl, config.signedUrls.downloadTtlSeconds),
      hasDownloaded: true,
    });
  } catch (error) {
    logger.error(error, 'Error tracking download');
    res.status(500).json({ error: 'Failed to process download' });
  }
});

export default creativeRouter;

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { query } from '../../db/pool.js';
import { sanitizeString } from '../../utils/validation.js';
import { logger } from '../../logger.js';
import { getTelegramUploadSession } from '../../services/telegram-upload-session.js';
import { createNotification } from '../../services/notifications.js';
import { getCreativeById } from '../../services/creative.js';

export const appDataRouter = Router();

const notificationTypes = [
  'status_update',
  'download',
  'new_creative',
  'reminder',
  'burnout',
  'comment',
  'resurrection',
  'mention',
];

const defaultGeos = ['DE', 'IL', 'PL', 'GB', 'US'];

const parseStringArray = (value: unknown, maxLength = 64): string[] => {
  if (!value) {
    return [];
  }

  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim().startsWith('[')
      ? JSON.parse(value)
      : String(value).split(',');

  return Array.isArray(raw)
    ? raw.map((item) => sanitizeString(String(item), maxLength)).filter(Boolean)
    : [];
};

const presetFields = `
  id,
  name,
  geo_codes,
  angles,
  language,
  preland,
  created_at
`;

const subscriptionFields = 'id, geo_code, angle, created_at';

appDataRouter.get('/reference', requireAuth, async (_req: Request, res: Response) => {
  try {
    const [anglesResult, languagesResult] = await Promise.all([
      query(
        `SELECT value FROM reference_lists
         WHERE list_type = 'angle' AND is_active = true
         ORDER BY sort_order ASC, value ASC`
      ),
      query(
        `SELECT value FROM reference_lists
         WHERE list_type = 'language' AND is_active = true
         ORDER BY sort_order ASC, value ASC`
      ),
    ]);

    res.json({
      data: {
        geos: defaultGeos,
        angles: anglesResult.rows.map((row: { value: string }) => row.value),
        languages: languagesResult.rows.map((row: { value: string }) => row.value),
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching reference lists');
    res.status(500).json({ error: 'Failed to fetch reference lists' });
  }
});

appDataRouter.get('/upload-sessions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const session = await getTelegramUploadSession(req.params.id);

    if (!session || String(session.telegramId) !== String(req.user.telegram_id)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    res.json({
      data: {
        id: session.id,
        createdAt: session.createdAt,
        files: session.files.map((file, index) => ({
          id: `${session.id}-${index}`,
          index,
          fileName: file.fileName,
          fileType: file.fileType,
          mimeType: file.mimeType,
          size: file.size || 0,
        })),
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching upload session');
    res.status(500).json({ error: 'Failed to fetch upload session' });
  }
});

const sanitizeSubscriptionInput = (body: Record<string, any>) => ({
  geoCode: body.geoCode ? sanitizeString(String(body.geoCode), 2).toUpperCase() : null,
  angle: body.angle ? sanitizeString(String(body.angle), 64) : null,
});

const sanitizePresetInput = (body: Record<string, any>, partial = false) => {
  const name = body.name !== undefined ? sanitizeString(String(body.name), 64) : undefined;
  const geoCodes = body.geoCodes !== undefined || body.geo_codes !== undefined
    ? parseStringArray(body.geoCodes ?? body.geo_codes, 2).map((geo) => geo.toUpperCase())
    : undefined;
  const angles = body.angles !== undefined ? parseStringArray(body.angles, 64) : undefined;
  const language = body.language !== undefined && body.language !== null
    ? sanitizeString(String(body.language), 8)
    : undefined;
  const preland = body.preland !== undefined && body.preland !== null
    ? sanitizeString(String(body.preland), 255)
    : undefined;

  if (!partial && (!name || !geoCodes?.length || !angles?.length)) {
    throw Object.assign(new Error('name, geoCodes and angles are required'), { statusCode: 400 });
  }

  return { name, geoCodes, angles, language, preland };
};

const creativeSelect = `
  c.*,
  u.username AS author_username,
  u.display_name AS author_display_name,
  p.short_id AS parent_short_id,
  array_agg(DISTINCT cg.geo_code) AS geos,
  array_agg(DISTINCT ca.angle) AS angles,
  COUNT(DISTINCT cs.id)::INT AS tester_count,
  COUNT(DISTINCT cm.id)::INT AS comment_count
`;

const creativeJoins = `
  JOIN creatives c ON c.id = b.creative_id
  JOIN users u ON u.id = c.author_id
  LEFT JOIN creatives p ON p.id = c.parent_creative_id
  LEFT JOIN creative_geos cg ON c.id = cg.creative_id
  LEFT JOIN creative_angles ca ON c.id = ca.creative_id
  LEFT JOIN creative_statuses cs ON c.id = cs.creative_id
  LEFT JOIN comments cm ON c.id = cm.creative_id
`;

appDataRouter.get('/activity/week', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const result = await query(
      `SELECT *
       FROM (
         SELECT al.id,
                al.action AS type,
                al.metadata AS payload,
                al.created_at,
                u.username,
                u.display_name,
                c.short_id
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN creatives c ON c.id = al.target_id
         WHERE al.target_type = 'creative'
           AND al.action <> 'comment'
           AND al.created_at >= NOW() - INTERVAL '7 days'

         UNION ALL

         SELECT cm.id,
                'comment' AS type,
                jsonb_build_object('text', cm.text) AS payload,
                cm.created_at,
                u.username,
                u.display_name,
                c.short_id
         FROM comments cm
         JOIN users u ON u.id = cm.author_id
         JOIN creatives c ON c.id = cm.creative_id
         WHERE cm.created_at >= NOW() - INTERVAL '7 days'

         UNION ALL

         SELECT d.id,
                'download' AS type,
                '{}'::jsonb AS payload,
                d.created_at,
                u.username,
                u.display_name,
                c.short_id
         FROM downloads d
         JOIN users u ON u.id = d.user_id
         JOIN creatives c ON c.id = d.creative_id
         WHERE d.created_at >= NOW() - INTERVAL '7 days'

         UNION ALL

         SELECT n.id,
                n.type,
                n.payload,
                n.created_at,
                NULL AS username,
                NULL AS display_name,
                n.payload->>'shortId' AS short_id
         FROM notifications n
         WHERE n.user_id = $1
           AND n.created_at >= NOW() - INTERVAL '7 days'
       ) activity
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching weekly activity');
    res.status(500).json({ error: 'Failed to fetch weekly activity' });
  }
});

appDataRouter.get('/top/week', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const result = await query(
      `SELECT c.id,
              c.short_id,
              c.aggregated_status,
              array_remove(array_agg(DISTINCT cg.geo_code), NULL) AS geos,
              array_remove(array_agg(DISTINCT ca.angle), NULL) AS angles,
              COUNT(DISTINCT cs.id) FILTER (WHERE cs.updated_at >= NOW() - INTERVAL '7 days')::INT AS status_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.created_at >= NOW() - INTERVAL '7 days')::INT AS download_count,
              COUNT(DISTINCT cm.id) FILTER (WHERE cm.created_at >= NOW() - INTERVAL '7 days')::INT AS comment_count,
              COUNT(DISTINCT b.user_id) FILTER (WHERE b.created_at >= NOW() - INTERVAL '7 days')::INT AS bookmark_count,
              (
                COUNT(DISTINCT cs.id) FILTER (WHERE cs.updated_at >= NOW() - INTERVAL '7 days') * 4
                + COUNT(DISTINCT d.id) FILTER (WHERE d.created_at >= NOW() - INTERVAL '7 days') * 3
                + COUNT(DISTINCT cm.id) FILTER (WHERE cm.created_at >= NOW() - INTERVAL '7 days') * 2
                + COUNT(DISTINCT b.user_id) FILTER (WHERE b.created_at >= NOW() - INTERVAL '7 days')
                + CASE WHEN c.created_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END
              )::INT AS score
       FROM creatives c
       LEFT JOIN creative_geos cg ON c.id = cg.creative_id
       LEFT JOIN creative_angles ca ON c.id = ca.creative_id
       LEFT JOIN creative_statuses cs ON c.id = cs.creative_id
       LEFT JOIN downloads d ON c.id = d.creative_id
       LEFT JOIN comments cm ON c.id = cm.creative_id
       LEFT JOIN bookmarks b ON c.id = b.creative_id
       WHERE c.is_archived = false
       GROUP BY c.id
       HAVING (
         COUNT(DISTINCT cs.id) FILTER (WHERE cs.updated_at >= NOW() - INTERVAL '7 days')
         + COUNT(DISTINCT d.id) FILTER (WHERE d.created_at >= NOW() - INTERVAL '7 days')
         + COUNT(DISTINCT cm.id) FILTER (WHERE cm.created_at >= NOW() - INTERVAL '7 days')
         + COUNT(DISTINCT b.user_id) FILTER (WHERE b.created_at >= NOW() - INTERVAL '7 days')
         + CASE WHEN c.created_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END
       ) > 0
       ORDER BY score DESC, c.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching weekly top creatives');
    res.status(500).json({ error: 'Failed to fetch weekly top creatives' });
  }
});

appDataRouter.get('/activity', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const result = await query(
      `SELECT *
       FROM (
         SELECT al.id,
                al.action AS type,
                al.metadata AS payload,
                al.created_at,
                u.username,
                u.display_name,
                c.short_id
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN creatives c ON c.id = al.target_id
         WHERE al.target_type = 'creative'

         UNION ALL

         SELECT cm.id,
                'comment' AS type,
                jsonb_build_object('text', cm.text) AS payload,
                cm.created_at,
                u.username,
                u.display_name,
                c.short_id
         FROM comments cm
         JOIN users u ON u.id = cm.author_id
         JOIN creatives c ON c.id = cm.creative_id

         UNION ALL

         SELECT d.id,
                'download' AS type,
                '{}'::jsonb AS payload,
                d.created_at,
                u.username,
                u.display_name,
                c.short_id
         FROM downloads d
         JOIN users u ON u.id = d.user_id
         JOIN creatives c ON c.id = d.creative_id

         UNION ALL

         SELECT n.id,
                n.type,
                n.payload,
                n.created_at,
                NULL AS username,
                NULL AS display_name,
                n.payload->>'shortId' AS short_id
         FROM notifications n
         WHERE n.user_id = $1
       ) activity
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching activity');
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

appDataRouter.get('/bookmarks', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ${creativeSelect}, b.created_at AS bookmarked_at
       FROM bookmarks b
       ${creativeJoins}
       WHERE b.user_id = $1 AND c.is_archived = false
       GROUP BY c.id, u.username, u.display_name, p.short_id, b.created_at
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching bookmarks');
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

appDataRouter.get('/bookmarks/:creativeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT user_id, creative_id, created_at
       FROM bookmarks
       WHERE user_id = $1 AND creative_id = $2
       LIMIT 1`,
      [req.user.id, req.params.creativeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error fetching bookmark');
    res.status(500).json({ error: 'Failed to fetch bookmark' });
  }
});

appDataRouter.post('/bookmarks/:creativeId', requireAuth, async (req: Request, res: Response) => {
  try {
    await query(
      `INSERT INTO bookmarks (user_id, creative_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, creative_id) DO NOTHING`,
      [req.user.id, req.params.creativeId]
    );

    res.status(201).json({ message: 'Bookmarked' });
  } catch (error) {
    logger.error(error, 'Error creating bookmark');
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

appDataRouter.delete('/bookmarks/:creativeId', requireAuth, async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM bookmarks WHERE user_id = $1 AND creative_id = $2', [
      req.user.id,
      req.params.creativeId,
    ]);

    res.json({ message: 'Bookmark removed' });
  } catch (error) {
    logger.error(error, 'Error removing bookmark');
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
});

appDataRouter.get('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const [statsResult, subscriptionsResult, presetsResult, settingsResult] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::INT FROM creatives WHERE author_id = $1) AS uploads,
           (SELECT COUNT(*)::INT FROM creative_statuses WHERE buyer_id = $1) AS tests,
           COALESCE(ROUND(
             100.0 * COUNT(*) FILTER (WHERE roi_category = 'green')
             / NULLIF(COUNT(*) FILTER (WHERE roi_category IS NOT NULL), 0)
           ), 0)::INT AS accuracy
         FROM creative_statuses
         WHERE buyer_id = $1`,
        [req.user.id]
      ),
      query('SELECT id, geo_code, angle, created_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC', [
        req.user.id,
      ]),
      query('SELECT id, name, geo_codes, angles, language, preland FROM presets WHERE user_id = $1 ORDER BY created_at DESC', [
        req.user.id,
      ]),
      query('SELECT type, is_enabled FROM notification_settings WHERE user_id = $1', [req.user.id]),
    ]);

    const settings = Object.fromEntries(notificationTypes.map((type) => [type, true]));
    for (const row of settingsResult.rows) {
      settings[row.type] = row.is_enabled;
    }

    res.json({
      data: {
        user: {
          id: req.user.id,
          telegramId: req.user.telegram_id,
          username: req.user.username,
          displayName: req.user.display_name,
          role: req.user.role,
          createdAt: req.user.created_at,
        },
        stats: statsResult.rows[0] || { uploads: 0, tests: 0, accuracy: 0 },
        subscriptions: subscriptionsResult.rows,
        presets: presetsResult.rows,
        notificationSettings: settings,
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching profile');
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

appDataRouter.get('/subscriptions', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ${subscriptionFields}
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching subscriptions');
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

appDataRouter.post('/subscriptions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { geoCode, angle } = sanitizeSubscriptionInput(req.body);

    if (!geoCode && !angle) {
      return res.status(400).json({ error: 'geoCode or angle is required' });
    }

    const result = await query(
      `INSERT INTO subscriptions (user_id, geo_code, angle)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, geo_code, angle) DO UPDATE SET created_at = subscriptions.created_at
       RETURNING id, geo_code, angle, created_at`,
      [req.user.id, geoCode, angle]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error creating subscription');
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

appDataRouter.get('/subscriptions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ${subscriptionFields}
       FROM subscriptions
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error fetching subscription');
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

appDataRouter.put('/subscriptions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { geoCode, angle } = sanitizeSubscriptionInput(req.body);

    if (!geoCode && !angle) {
      return res.status(400).json({ error: 'geoCode or angle is required' });
    }

    const result = await query(
      `UPDATE subscriptions
       SET geo_code = $1, angle = $2
       WHERE id = $3 AND user_id = $4
       RETURNING ${subscriptionFields}`,
      [geoCode, angle, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error updating subscription');
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

appDataRouter.delete('/subscriptions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM subscriptions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Subscription removed' });
  } catch (error) {
    logger.error(error, 'Error removing subscription');
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

appDataRouter.get('/presets', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ${presetFields}
       FROM presets
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching presets');
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

appDataRouter.post('/presets', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = sanitizePresetInput(req.body);
    const result = await query(
      `INSERT INTO presets (user_id, name, geo_codes, angles, language, preland)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${presetFields}`,
      [req.user.id, input.name, input.geoCodes, input.angles, input.language || null, input.preland || null]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error: any) {
    logger.error(error, 'Error creating preset');
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to create preset' });
  }
});

appDataRouter.get('/presets/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ${presetFields}
       FROM presets
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error fetching preset');
    res.status(500).json({ error: 'Failed to fetch preset' });
  }
});

appDataRouter.put('/presets/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = sanitizePresetInput(req.body);
    const result = await query(
      `UPDATE presets
       SET name = $1,
           geo_codes = $2,
           angles = $3,
           language = $4,
           preland = $5
       WHERE id = $6 AND user_id = $7
       RETURNING ${presetFields}`,
      [input.name, input.geoCodes, input.angles, input.language || null, input.preland || null, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error: any) {
    logger.error(error, 'Error updating preset');
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to update preset' });
  }
});

appDataRouter.patch('/presets/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = sanitizePresetInput(req.body, true);
    const result = await query(
      `UPDATE presets
       SET name = COALESCE($1, name),
           geo_codes = COALESCE($2, geo_codes),
           angles = COALESCE($3, angles),
           language = COALESCE($4, language),
           preland = COALESCE($5, preland)
       WHERE id = $6 AND user_id = $7
       RETURNING ${presetFields}`,
      [
        input.name ?? null,
        input.geoCodes ?? null,
        input.angles ?? null,
        input.language ?? null,
        input.preland ?? null,
        req.params.id,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error patching preset');
    res.status(500).json({ error: 'Failed to update preset' });
  }
});

appDataRouter.delete('/presets/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query('DELETE FROM presets WHERE id = $1 AND user_id = $2 RETURNING id', [
      req.params.id,
      req.user.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json({ message: 'Preset removed' });
  } catch (error) {
    logger.error(error, 'Error deleting preset');
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

appDataRouter.get('/notification-settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT type, is_enabled FROM notification_settings WHERE user_id = $1', [req.user.id]);
    const settings = Object.fromEntries(notificationTypes.map((type) => [type, true]));

    for (const row of result.rows) {
      settings[row.type] = row.is_enabled;
    }

    res.json({ data: settings });
  } catch (error) {
    logger.error(error, 'Error fetching notification settings');
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

appDataRouter.put('/notification-settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const settings = req.body.settings && typeof req.body.settings === 'object' ? req.body.settings : req.body;
    const rows = Object.entries(settings)
      .filter(([type]) => notificationTypes.includes(type))
      .map(([type, value]) => [req.user.id, type, Boolean(value)]);

    await Promise.all(rows.map(([userId, type, isEnabled]) =>
      query(
        `INSERT INTO notification_settings (user_id, type, is_enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, type) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
        [userId, type, isEnabled]
      )
    ));

    const result = await query('SELECT type, is_enabled FROM notification_settings WHERE user_id = $1', [req.user.id]);
    const response = Object.fromEntries(notificationTypes.map((type) => [type, true]));
    for (const row of result.rows) {
      response[row.type] = row.is_enabled;
    }

    res.json({ data: response });
  } catch (error) {
    logger.error(error, 'Error replacing notification settings');
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

appDataRouter.patch('/notification-settings/:type', requireAuth, async (req: Request, res: Response) => {
  try {
    const type = sanitizeString(req.params.type, 64);
    const isEnabled = Boolean(req.body.isEnabled);

    const result = await query(
      `INSERT INTO notification_settings (user_id, type, is_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, type) DO UPDATE SET is_enabled = EXCLUDED.is_enabled
       RETURNING type, is_enabled`,
      [req.user.id, type, isEnabled]
    );

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error updating notification setting');
    res.status(500).json({ error: 'Failed to update notification setting' });
  }
});

appDataRouter.delete('/notification-settings/:type', requireAuth, async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM notification_settings WHERE user_id = $1 AND type = $2', [
      req.user.id,
      sanitizeString(req.params.type, 64),
    ]);

    res.json({ message: 'Notification setting reset' });
  } catch (error) {
    logger.error(error, 'Error deleting notification setting');
    res.status(500).json({ error: 'Failed to delete notification setting' });
  }
});

appDataRouter.delete('/notification-settings', requireAuth, async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM notification_settings WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Notification settings reset' });
  } catch (error) {
    logger.error(error, 'Error deleting notification settings');
    res.status(500).json({ error: 'Failed to delete notification settings' });
  }
});

const parseMentions = (text: string) => {
  const matches = text.match(/@([a-zA-Z0-9_]{3,64})/g) || [];
  return [...new Set(matches.map((mention) => mention.slice(1).toLowerCase()))];
};

appDataRouter.get('/creatives/:creativeId/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT cm.id,
              cm.text,
              cm.created_at,
              cm.parent_id,
              u.username,
              u.display_name
       FROM comments cm
       JOIN users u ON u.id = cm.author_id
       WHERE cm.creative_id = $1
       ORDER BY COALESCE(cm.parent_id, cm.id) DESC, cm.created_at ASC`,
      [req.params.creativeId]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching comments');
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

appDataRouter.post('/creatives/:creativeId/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const text = sanitizeString(String(req.body.text || ''), 2000);
    const parentId = req.body.parentId ? sanitizeString(String(req.body.parentId), 64) : null;

    if (!text) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    if (parentId) {
      const parentResult = await query(
        'SELECT id FROM comments WHERE id = $1 AND creative_id = $2 LIMIT 1',
        [parentId, req.params.creativeId]
      );
      if (parentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Parent comment not found' });
      }
    }

    const result = await query(
      `INSERT INTO comments (creative_id, author_id, text, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, text, created_at, parent_id`,
      [req.params.creativeId, req.user.id, text, parentId]
    );

    await query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
       VALUES ($1, 'comment', 'creative', $2, $3)`,
      [req.user.id, req.params.creativeId, JSON.stringify({ text, parentId })]
    );

    const creative = await getCreativeById(req.params.creativeId);
    const authorId = (creative as any)?.author_id || creative?.authorId;
    const shortId = (creative as any)?.short_id || creative?.shortId;
    const actorName = req.user.username ? `@${req.user.username}` : req.user.display_name || 'користувач';

    if (authorId && authorId !== req.user.id) {
      await createNotification(authorId, 'comment', {
        creativeId: req.params.creativeId,
        shortId,
        text: `${actorName} залишив коментар під ${shortId}`,
      });
    }

    const mentions = parseMentions(text);
    if (mentions.length > 0) {
      const mentionedUsers = await query(
        `SELECT id, username FROM users
         WHERE LOWER(username) = ANY($1::TEXT[])
           AND is_active = true`,
        [mentions]
      );

      await Promise.all(
        mentionedUsers.rows
          .filter((user: { id: string }) => user.id !== req.user.id)
          .map((user: { id: string; username: string }) =>
            createNotification(user.id, 'mention', {
              creativeId: req.params.creativeId,
              shortId,
              text: `${actorName} згадав тебе в коментарі до ${shortId}`,
            })
          )
      );
    }

    res.status(201).json({
      data: {
        ...result.rows[0],
        username: req.user.username,
        display_name: req.user.display_name,
      },
    });
  } catch (error) {
    logger.error(error, 'Error creating comment');
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

appDataRouter.get('/comments/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT cm.id, cm.creative_id, cm.text, cm.created_at, u.username, u.display_name
       FROM comments cm
       JOIN users u ON u.id = cm.author_id
       JOIN creatives c ON c.id = cm.creative_id
       WHERE cm.id = $1
         AND (
           cm.author_id = $2
           OR c.author_id = $2
           OR EXISTS (SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'lead'))
         )
       LIMIT 1`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error fetching comment');
    res.status(500).json({ error: 'Failed to fetch comment' });
  }
});

appDataRouter.put('/comments/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const text = sanitizeString(String(req.body.text || ''), 2000);

    if (!text) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const result = await query(
      `UPDATE comments
       SET text = $1
       WHERE id = $2 AND author_id = $3
       RETURNING id, creative_id, text, created_at`,
      [text, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({
      data: {
        ...result.rows[0],
        username: req.user.username,
        display_name: req.user.display_name,
      },
    });
  } catch (error) {
    logger.error(error, 'Error updating comment');
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

appDataRouter.delete('/comments/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM comments cm
       USING creatives c
       WHERE cm.id = $1
         AND c.id = cm.creative_id
         AND (
           cm.author_id = $2
           OR c.author_id = $2
           OR EXISTS (SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'lead'))
         )
       RETURNING cm.id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ message: 'Comment removed' });
  } catch (error) {
    logger.error(error, 'Error deleting comment');
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default appDataRouter;

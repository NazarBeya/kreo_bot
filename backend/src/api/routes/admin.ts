import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { query } from '../../db/pool.js';
import { archiveDeadCreatives, pruneDownloadLogs } from '../../services/status.js';
import { getNumericSetting } from '../../services/admin-settings.js';
import { logger } from '../../logger.js';

export const adminRouter = Router();

const csvEscape = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (rows: Record<string, any>[]) => {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
};

const toExcelHtml = (rows: Record<string, any>[]) => {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const cell = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!doctype html><html><head><meta charset="utf-8"></head><body><table><thead><tr>${headers
    .map((header) => `<th>${cell(header)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${headers.map((header) => `<td>${cell(row[header])}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></body></html>`;
};

const exportCreativesRows = async () => {
  const result = await query(
    `SELECT c.short_id,
            c.aggregated_status,
            c.moderation_status,
            c.is_archived,
            u.username AS author,
            array_to_string(array_remove(array_agg(DISTINCT cg.geo_code), NULL), ';') AS geos,
            array_to_string(array_remove(array_agg(DISTINCT ca.angle), NULL), ';') AS angles,
            COUNT(DISTINCT d.id)::INT AS downloads,
            COUNT(DISTINCT cm.id)::INT AS comments,
            COUNT(DISTINCT cs.id)::INT AS statuses,
            c.created_at
     FROM creatives c
     JOIN users u ON u.id = c.author_id
     LEFT JOIN creative_geos cg ON c.id = cg.creative_id
     LEFT JOIN creative_angles ca ON c.id = ca.creative_id
     LEFT JOIN downloads d ON d.creative_id = c.id
     LEFT JOIN comments cm ON cm.creative_id = c.id
     LEFT JOIN creative_statuses cs ON cs.creative_id = c.id
     GROUP BY c.id, u.username
     ORDER BY c.created_at DESC`
  );

  return result.rows;
};

const buyerActivityRows = async () => {
  const result = await query(
    `SELECT u.id,
            COALESCE(u.username, u.display_name, u.telegram_id::TEXT) AS buyer,
            COUNT(DISTINCT c.id)::INT AS uploads,
            COUNT(DISTINCT cs.id)::INT AS tests,
            COUNT(DISTINCT cm.id)::INT AS comments,
            COUNT(DISTINCT d.id)::INT AS downloads,
            COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= NOW() - INTERVAL '7 days')::INT AS uploads_week,
            COUNT(DISTINCT cs.id) FILTER (WHERE cs.updated_at >= NOW() - INTERVAL '7 days')::INT AS tests_week,
            COUNT(DISTINCT cm.id) FILTER (WHERE cm.created_at >= NOW() - INTERVAL '7 days')::INT AS comments_week
     FROM users u
     LEFT JOIN creatives c ON c.author_id = u.id
     LEFT JOIN creative_statuses cs ON cs.buyer_id = u.id
     LEFT JOIN comments cm ON cm.author_id = u.id
     LEFT JOIN downloads d ON d.user_id = u.id
     WHERE u.role IN ('buyer', 'lead', 'admin')
     GROUP BY u.id
     ORDER BY (COUNT(DISTINCT c.id) + COUNT(DISTINCT cs.id) + COUNT(DISTINCT cm.id) + COUNT(DISTINCT d.id)) DESC`
  );

  return result.rows;
};

const buyerTrackRecordRows = async () => {
  const result = await query(
    `SELECT u.id,
            u.username,
            u.display_name,
            COUNT(DISTINCT c.id)::INT AS uploads,
            COUNT(DISTINCT cm.id)::INT AS comments,
            COUNT(DISTINCT d.id)::INT AS downloads,
            COUNT(DISTINCT cs.id)::INT AS statuses,
            COUNT(DISTINCT cs.creative_id)::INT AS creatives_tested,
            COUNT(DISTINCT cs.id) FILTER (WHERE cs.roi_category = 'green')::INT AS green,
            COUNT(DISTINCT cs.id) FILTER (WHERE cs.roi_category = 'yellow')::INT AS yellow,
            COUNT(DISTINCT cs.id) FILTER (WHERE cs.roi_category = 'red')::INT AS red,
            COUNT(DISTINCT cs.id) FILTER (
              WHERE cs.status = 'working'
                AND EXISTS (
                  SELECT 1
                  FROM creative_statuses other_cs
                  WHERE other_cs.creative_id = cs.creative_id
                    AND other_cs.buyer_id <> cs.buyer_id
                    AND other_cs.status = 'working'
                )
            )::INT AS working_confirmed_by_others,
            COALESCE(ROUND(
              100.0 * COUNT(DISTINCT cs.id) FILTER (WHERE cs.roi_category = 'green')
              / NULLIF(COUNT(DISTINCT cs.id) FILTER (WHERE cs.roi_category IS NOT NULL), 0)
            ), 0)::INT AS green_rate,
            COALESCE(ROUND(
              100.0 * COUNT(DISTINCT cs.id) FILTER (
                WHERE cs.status = 'working'
                  AND EXISTS (
                    SELECT 1
                    FROM creative_statuses other_cs
                    WHERE other_cs.creative_id = cs.creative_id
                      AND other_cs.buyer_id <> cs.buyer_id
                      AND other_cs.status = 'working'
                  )
              ) / NULLIF(COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'working'), 0)
            ), 0)::INT AS prediction_accuracy,
            COUNT(DISTINCT d.creative_id) FILTER (
              WHERE d.created_at <= NOW() - INTERVAL '14 days'
                AND NOT EXISTS (
                  SELECT 1
                  FROM creative_statuses cs2
                  WHERE cs2.creative_id = d.creative_id
                    AND cs2.buyer_id = d.user_id
                    AND cs2.updated_at >= d.created_at
                )
            )::INT AS overdue_downloads,
            (COUNT(DISTINCT c.id) + COUNT(DISTINCT cs.id) + COUNT(DISTINCT cm.id) + COUNT(DISTINCT d.id))::INT AS total_activity,
            MAX(cs.updated_at) AS last_status_at,
            MAX(d.created_at) AS last_download_at
     FROM users u
     LEFT JOIN creatives c ON c.author_id = u.id
     LEFT JOIN comments cm ON cm.author_id = u.id
     LEFT JOIN downloads d ON d.user_id = u.id
     LEFT JOIN creative_statuses cs ON cs.buyer_id = u.id
     WHERE u.role IN ('buyer', 'lead')
     GROUP BY u.id
     ORDER BY prediction_accuracy DESC, working_confirmed_by_others DESC, total_activity DESC`
  );

  return result.rows;
};

const downloadLogRows = async () => {
  const result = await query(
    `SELECT d.created_at,
            u.telegram_id,
            u.username,
            u.display_name,
            c.short_id AS creative_id,
            d.ip,
            d.user_agent
     FROM downloads d
     JOIN users u ON u.id = d.user_id
     JOIN creatives c ON c.id = d.creative_id
     ORDER BY d.created_at DESC`
  );

  return result.rows;
};

const moderationExportRows = async () => {
  const result = await query(
    `SELECT c.short_id,
            c.moderation_status,
            c.moderation_comment,
            u.username AS author,
            moderator.username AS moderator,
            c.created_at,
            c.moderated_at
     FROM creatives c
     JOIN users u ON u.id = c.author_id
     LEFT JOIN users moderator ON moderator.id = c.moderated_by
     ORDER BY c.created_at DESC`
  );

  return result.rows;
};

const exportDatasetRows = async (dataset: string) => {
  if (dataset === 'buyers') {
    return buyerTrackRecordRows();
  }

  if (dataset === 'downloads') {
    return downloadLogRows();
  }

  if (dataset === 'activity') {
    return buyerActivityRows();
  }

  if (dataset === 'moderation') {
    return moderationExportRows();
  }

  return exportCreativesRows();
};

adminRouter.get('/dashboard', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [summary, statusRows, weeklyRows, angleRows, moderationRows] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::INT AS creatives,
           COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '7 days')::INT AS creatives_week,
           COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '30 days')::INT AS creatives_month,
           COUNT(*) FILTER (WHERE c.is_archived = true)::INT AS archived_creatives,
           COUNT(*) FILTER (WHERE c.is_archived = true AND c.aggregated_status = 'dead')::INT AS dead_archive,
           COUNT(*) FILTER (WHERE c.moderation_status = 'pending_review')::INT AS pending_moderation,
           (SELECT COUNT(*)::INT FROM users WHERE is_active = true) AS active_users,
           (SELECT COUNT(*)::INT FROM downloads WHERE created_at >= NOW() - INTERVAL '7 days') AS downloads_week,
           (SELECT COUNT(*)::INT FROM downloads WHERE created_at >= NOW() - INTERVAL '30 days') AS downloads_month,
           (SELECT COUNT(*)::INT FROM comments WHERE created_at >= NOW() - INTERVAL '7 days') AS comments_week,
           (SELECT COUNT(*)::INT FROM creative_statuses WHERE updated_at >= NOW() - INTERVAL '7 days') AS tests_week
         FROM creatives c`
      ),
      query(
        `SELECT aggregated_status AS label, COUNT(*)::INT AS value
         FROM creatives
         WHERE moderation_status = 'approved'
         GROUP BY aggregated_status
         ORDER BY value DESC`
      ),
      query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS label,
                COALESCE(upload_count, 0)::INT AS uploads,
                COALESCE(download_count, 0)::INT AS downloads
         FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') day
         LEFT JOIN (
           SELECT DATE(created_at) AS created_day, COUNT(*) AS upload_count
           FROM creatives
           GROUP BY DATE(created_at)
         ) uploads ON uploads.created_day = day::date
         LEFT JOIN (
           SELECT DATE(created_at) AS download_day, COUNT(*) AS download_count
           FROM downloads
           GROUP BY DATE(created_at)
         ) downloads ON downloads.download_day = day::date
         ORDER BY day`
      ),
      query(
        `SELECT ca.angle AS label, COUNT(DISTINCT ca.creative_id)::INT AS value
         FROM creative_angles ca
         JOIN creatives c ON c.id = ca.creative_id
         WHERE c.moderation_status = 'approved'
         GROUP BY ca.angle
         ORDER BY value DESC
         LIMIT 10`
      ),
      query(
        `SELECT moderation_status AS label, COUNT(*)::INT AS value
         FROM creatives
         GROUP BY moderation_status
         ORDER BY value DESC`
      ),
    ]);

    res.json({
      data: {
        summary: summary.rows[0],
        charts: {
          statuses: statusRows.rows,
          weekly: weeklyRows.rows,
          angles: angleRows.rows,
          moderation: moderationRows.rows,
        },
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching admin dashboard');
    res.status(500).json({ error: 'Failed to fetch admin dashboard' });
  }
});

adminRouter.get('/analytics', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [
      geoRows,
      lifecycleRows,
      reviewerRows,
      notificationRows,
      roiRows,
      moderationSlaRows,
      buyerActivityRowsData,
      monthDynamics,
      archiveRows,
    ] = await Promise.all([
      query(
        `SELECT cg.geo_code AS label,
                COUNT(DISTINCT c.id)::INT AS creatives,
                COUNT(DISTINCT d.id)::INT AS downloads,
                COUNT(DISTINCT cs.id)::INT AS statuses,
                COUNT(DISTINCT cs.id) FILTER (WHERE cs.roi_category = 'green')::INT AS green,
                COUNT(DISTINCT cs.id) FILTER (WHERE cs.roi_category = 'red')::INT AS red,
                (
                  COUNT(DISTINCT cs.id) FILTER (WHERE cs.status = 'working') * 3
                  + COUNT(DISTINCT d.id)
                  + COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= NOW() - INTERVAL '7 days') * 2
                )::INT AS hot_score
         FROM creative_geos cg
         JOIN creatives c ON c.id = cg.creative_id
         LEFT JOIN downloads d ON d.creative_id = c.id
         LEFT JOIN creative_statuses cs ON cs.creative_id = c.id
         GROUP BY cg.geo_code
         ORDER BY hot_score DESC, creatives DESC
         LIMIT 12`
      ),
      query(
        `SELECT author_lifecycle_status AS label, COUNT(*)::INT AS value
         FROM creatives
         GROUP BY author_lifecycle_status
         ORDER BY value DESC`
      ),
      query(
        `SELECT COALESCE(u.username, u.display_name, 'n/a') AS label,
                COUNT(*)::INT AS reviewed,
                COUNT(*) FILTER (WHERE c.moderation_status = 'approved')::INT AS approved,
                COUNT(*) FILTER (WHERE c.moderation_status = 'rejected')::INT AS rejected
         FROM creatives c
         LEFT JOIN users u ON u.id = c.moderated_by
         WHERE c.moderated_by IS NOT NULL
         GROUP BY u.id
         ORDER BY reviewed DESC
         LIMIT 10`
      ),
      query(
        `SELECT type AS label,
                COUNT(*)::INT AS value,
                COUNT(*) FILTER (WHERE is_read = false)::INT AS unread
         FROM notifications
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY type
         ORDER BY value DESC`
      ),
      query(
        `SELECT COALESCE(roi_category, 'unknown') AS label, COUNT(*)::INT AS value
         FROM creative_statuses
         GROUP BY COALESCE(roi_category, 'unknown')
         ORDER BY value DESC`
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE moderation_status = 'pending_review')::INT AS pending,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (moderated_at - created_at))) / 3600, 1), 0)::FLOAT AS avg_hours
         FROM creatives
         WHERE moderation_status = 'pending_review'
            OR moderated_at IS NOT NULL`
      ),
      buyerActivityRows(),
      query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS label,
                COALESCE(upload_count, 0)::INT AS uploads,
                COALESCE(test_count, 0)::INT AS tests,
                COALESCE(comment_count, 0)::INT AS comments,
                COALESCE(download_count, 0)::INT AS downloads
         FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') day
         LEFT JOIN (
           SELECT DATE(created_at) AS created_day, COUNT(*) AS upload_count
           FROM creatives
           GROUP BY DATE(created_at)
         ) uploads ON uploads.created_day = day::date
         LEFT JOIN (
           SELECT DATE(updated_at) AS test_day, COUNT(*) AS test_count
           FROM creative_statuses
           GROUP BY DATE(updated_at)
         ) tests ON tests.test_day = day::date
         LEFT JOIN (
           SELECT DATE(created_at) AS comment_day, COUNT(*) AS comment_count
           FROM comments
           GROUP BY DATE(created_at)
         ) comments ON comments.comment_day = day::date
         LEFT JOIN (
           SELECT DATE(created_at) AS download_day, COUNT(*) AS download_count
           FROM downloads
           GROUP BY DATE(created_at)
         ) downloads ON downloads.download_day = day::date
         ORDER BY day`
      ),
      query(
        `SELECT aggregated_status AS label,
                COUNT(*)::INT AS value,
                COUNT(*) FILTER (WHERE is_archived = true)::INT AS archived
         FROM creatives
         GROUP BY aggregated_status
         ORDER BY value DESC`
      ),
    ]);
    res.json({
      data: {
        geos: geoRows.rows,
        lifecycle: lifecycleRows.rows,
        reviewers: reviewerRows.rows,
        notifications: notificationRows.rows,
        roi: roiRows.rows,
        moderationSla: moderationSlaRows.rows[0],
        buyerActivity: buyerActivityRowsData,
        monthDynamics: monthDynamics.rows,
        archive: archiveRows.rows,
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching admin analytics');
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

adminRouter.get('/buyers/track-record', requireAdmin, async (req: Request, res: Response) => {
  try {
    res.json({ data: await buyerTrackRecordRows() });
  } catch (error) {
    logger.error(error, 'Error fetching buyer track record');
    res.status(500).json({ error: 'Failed to fetch buyer track record' });
  }
});

adminRouter.get('/exports', requireAdmin, async (req: Request, res: Response) => {
  try {
    const dataset = String(req.query.dataset || 'creatives');
    const format = String(req.query.format || 'csv');
    const rows = await exportDatasetRows(dataset);
    const extension = format === 'xls' ? 'xls' : 'csv';

    res.setHeader(
      'Content-Type',
      extension === 'xls' ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${dataset}.${extension}"`);
    res.send(extension === 'xls' ? toExcelHtml(rows) : toCsv(rows));
  } catch (error) {
    logger.error(error, 'Error exporting dataset');
    res.status(500).json({ error: 'Failed to export dataset' });
  }
});

adminRouter.get('/exports/creatives.csv', requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await exportCreativesRows();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="creatives.csv"');
    res.send(toCsv(rows));
  } catch (error) {
    logger.error(error, 'Error exporting CSV');
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

adminRouter.get('/exports/creatives.xls', requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await exportCreativesRows();
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="creatives.xls"');
    res.send(toExcelHtml(rows));
  } catch (error) {
    logger.error(error, 'Error exporting Excel');
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

adminRouter.get('/angles', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, value, is_active, sort_order, created_at
       FROM reference_lists
       WHERE list_type = 'angle'
       ORDER BY sort_order NULLS LAST, value`
    );
    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching angles');
    res.status(500).json({ error: 'Failed to fetch angles' });
  }
});

adminRouter.post('/angles', requireAdmin, async (req: Request, res: Response) => {
  try {
    const value = String(req.body.value || '').trim();
    const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : null;

    if (!value) {
      return res.status(400).json({ error: 'value is required' });
    }

    const result = await query(
      `INSERT INTO reference_lists (list_type, value, is_active, sort_order)
       VALUES ('angle', $1, COALESCE($2, true), $3)
       ON CONFLICT (list_type, value) DO UPDATE
       SET is_active = EXCLUDED.is_active,
           sort_order = EXCLUDED.sort_order
       RETURNING id, value, is_active, sort_order, created_at`,
      [value, req.body.is_active, sortOrder]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error creating angle');
    res.status(500).json({ error: 'Failed to create angle' });
  }
});

adminRouter.put('/angles/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `UPDATE reference_lists
       SET value = COALESCE($1, value),
           is_active = COALESCE($2, is_active),
           sort_order = COALESCE($3, sort_order)
       WHERE id = $4 AND list_type = 'angle'
       RETURNING id, value, is_active, sort_order, created_at`,
      [
        req.body.value ? String(req.body.value).trim() : null,
        req.body.is_active,
        Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Angle not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error updating angle');
    res.status(500).json({ error: 'Failed to update angle' });
  }
});

adminRouter.delete('/angles/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await query(`UPDATE reference_lists SET is_active = false WHERE id = $1 AND list_type = 'angle'`, [req.params.id]);
    res.json({ message: 'Angle disabled' });
  } catch (error) {
    logger.error(error, 'Error disabling angle');
    res.status(500).json({ error: 'Failed to disable angle' });
  }
});

adminRouter.get('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT key, value, updated_at FROM admin_settings ORDER BY key');
    res.json({ data: Object.fromEntries(result.rows.map((row: { key: string; value: unknown }) => [row.key, row.value])) });
  } catch (error) {
    logger.error(error, 'Error fetching admin settings');
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

adminRouter.put('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const entries = Object.entries(req.body || {});

    for (const [key, value] of entries) {
      await query(
        `INSERT INTO admin_settings (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }

    const result = await query('SELECT key, value FROM admin_settings ORDER BY key');
    res.json({ data: Object.fromEntries(result.rows.map((row: { key: string; value: unknown }) => [row.key, row.value])) });
  } catch (error) {
    logger.error(error, 'Error updating admin settings');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

adminRouter.get('/moderation', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || 'pending_review');
    const search = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 250);
    const params: Array<string | number> = [status];
    const where = ['c.moderation_status = $1'];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(c.short_id ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
    }

    params.push(limit);
    const result = await query(
      `SELECT c.id,
              c.short_id,
              c.preview_url,
              c.file_type,
              c.moderation_status,
              c.moderation_comment,
              c.created_at,
              u.username AS author_username,
              u.display_name AS author_display_name,
              array_remove(array_agg(DISTINCT cg.geo_code), NULL) AS geos,
              array_remove(array_agg(DISTINCT ca.angle), NULL) AS angles
       FROM creatives c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN creative_geos cg ON cg.creative_id = c.id
       LEFT JOIN creative_angles ca ON ca.creative_id = c.id
       WHERE ${where.join(' AND ')}
       GROUP BY c.id, u.username, u.display_name
       ORDER BY c.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching moderation queue');
    res.status(500).json({ error: 'Failed to fetch moderation queue' });
  }
});

adminRouter.post('/moderation/:creativeId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const action = String(req.body.action || '');
    const moderationStatus = action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : null;

    if (!moderationStatus) {
      return res.status(400).json({ error: 'action must be approve or reject' });
    }

    const result = await query(
      `UPDATE creatives
       SET moderation_status = $1,
           moderated_by = $2,
           moderated_at = NOW(),
           moderation_comment = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, short_id, moderation_status, moderation_comment, moderated_at`,
      [moderationStatus, req.user.id, req.body.comment ? String(req.body.comment) : null, req.params.creativeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    await query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, 'creative', $3, $4)`,
      [
        req.user.id,
        `moderation_${moderationStatus}`,
        req.params.creativeId,
        JSON.stringify({ moderation_status: moderationStatus, comment: req.body.comment || null }),
      ]
    );

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error moderating creative');
    res.status(500).json({ error: 'Failed to moderate creative' });
  }
});

adminRouter.get('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT id, telegram_id, username, display_name, role, is_active, created_at, last_active_at FROM users ORDER BY created_at DESC');
    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

adminRouter.put('/users/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { role, is_active } = req.body;
    const { id } = req.params;
    
    if (id === req.user?.id && is_active === false) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const result = await query(
      `UPDATE users SET 
         role = COALESCE($1, role), 
         is_active = COALESCE($2, is_active) 
       WHERE id = $3 
       RETURNING id, telegram_id, username, display_name, role, is_active, created_at, last_active_at`,
      [role, is_active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error(error, 'Error updating user');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

adminRouter.post('/users/whitelist', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { telegram_id, role, username, display_name } = req.body;
    
    if (!telegram_id) {
      return res.status(400).json({ error: 'telegram_id is required' });
    }

    const result = await query(
      `INSERT INTO users (telegram_id, username, display_name, role, is_active, last_active_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING id, telegram_id, username, display_name, role, is_active, created_at, last_active_at`,
      [telegram_id, username || null, display_name || null, role || 'buyer']
    );
    
    res.status(201).json({ data: result.rows[0] });
  } catch (error: any) {
    logger.error(error, 'Error adding user to whitelist');
    if (error.code === '23505') {
      return res.status(400).json({ error: 'User already in whitelist' });
    }
    res.status(500).json({ error: 'Failed to add user to whitelist' });
  }
});

adminRouter.post('/maintenance/auto-archive', requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || await getNumericSetting('auto_archive_dead_days');
    const archivedCount = await archiveDeadCreatives(days);
    
    res.json({ message: `Successfully archived ${archivedCount} dead creatives`, count: archivedCount });
  } catch (error) {
    logger.error(error, 'Error running auto-archive maintenance');
    res.status(500).json({ error: 'Failed to run auto-archive' });
  }
});

adminRouter.post('/maintenance/prune-download-logs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || undefined;
    const prunedCount = await pruneDownloadLogs(days);

    res.json({ message: `Successfully pruned ${prunedCount} download logs`, count: prunedCount });
  } catch (error) {
    logger.error(error, 'Error pruning download logs');
    res.status(500).json({ error: 'Failed to prune download logs' });
  }
});

export default adminRouter;

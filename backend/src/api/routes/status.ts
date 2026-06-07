import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { setCreativeStatus, toggleCreativeArchive } from '../../services/status.js';
import { getCreativeById } from '../../services/creative.js';
import { notifyCreativeResurrected } from '../../services/notifications.js';
import { logger } from '../../logger.js';
import { query } from '../../db/pool.js';

export const statusRouter = Router();

statusRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role === 'designer') {
      return res.status(403).json({ error: 'Designers cannot set media buying statuses' });
    }

    const { creativeId, geoCode, status, testVolume, roiCategory, comment } = req.body;

    if (!creativeId || !geoCode || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await setCreativeStatus({
      creativeId,
      buyerId: req.user.id,
      geoCode: geoCode.toUpperCase(),
      status,
      testVolume,
      roiCategory,
      comment,
    });

    res.json({
      message: 'Status updated successfully',
      data: result,
    });
  } catch (error) {
    logger.error(error, 'Error in POST /api/status');
    res.status(500).json({ error: 'Failed to update status' });
  }
});

statusRouter.get('/:creativeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { creativeId } = req.params;
    
    if (req.user?.role === 'designer') {
      const creativeRes = await query(`SELECT author_id FROM creatives WHERE id = $1`, [creativeId]);
      if (creativeRes.rows.length === 0 || creativeRes.rows[0].author_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await query(
      `SELECT cs.*, u.display_name as buyer_name
       FROM creative_statuses cs
       JOIN users u ON u.id = cs.buyer_id
       WHERE cs.creative_id = $1
       ORDER BY cs.updated_at DESC`,
      [creativeId]
    );

    res.json({ data: result.rows });
  } catch (error) {
    logger.error(error, 'Error fetching statuses');
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
});

statusRouter.post('/:creativeId/resurrect', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role === 'designer') {
      return res.status(403).json({ error: 'Designers cannot resurrect creatives' });
    }

    const { creativeId } = req.params;
    const requestedGeo = req.body.geoCode ? String(req.body.geoCode).toUpperCase() : null;
    const creativeRes = await query(
      `SELECT c.id,
              c.short_id,
              c.is_archived,
              array_remove(array_agg(DISTINCT cg.geo_code), NULL) AS geos
       FROM creatives c
       LEFT JOIN creative_geos cg ON c.id = cg.creative_id
       WHERE c.id = $1
       GROUP BY c.id`,
      [creativeId]
    );

    if (creativeRes.rows.length === 0) {
      return res.status(404).json({ error: 'Creative not found' });
    }

    const geos = creativeRes.rows[0].geos || [];
    const geoCode = requestedGeo || geos[0];

    if (!geoCode) {
      return res.status(400).json({ error: 'Creative has no GEO to resurrect' });
    }

    await setCreativeStatus({
      creativeId,
      buyerId: req.user.id,
      geoCode,
      status: 'resurrected',
      roiCategory: 'green',
      comment: req.body.comment ? String(req.body.comment) : 'Resurrected from archive',
    });

    await toggleCreativeArchive(creativeId, false, req.user.id);

    const creative = await getCreativeById(creativeId);
    if (!creative) {
      return res.status(404).json({ error: 'Creative not found after resurrection' });
    }

    await notifyCreativeResurrected(creative, req.user);

    res.json({ data: creative });
  } catch (error) {
    logger.error(error, 'Error resurrecting creative');
    res.status(500).json({ error: 'Failed to resurrect creative' });
  }
});

statusRouter.post('/:creativeId/archive', requireAuth, async (req: Request, res: Response) => {
  try {
    const { creativeId } = req.params;
    const { isArchived } = req.body;
    
    if (req.user?.role === 'buyer' || req.user?.role === 'designer') {
      const creativeRes = await query(`SELECT author_id FROM creatives WHERE id = $1`, [creativeId]);
      if (creativeRes.rows.length === 0 || creativeRes.rows[0].author_id !== req.user.id) {
        return res.status(403).json({ error: 'Only admins or the author can archive this creative' });
      }
    }

    const creative = await toggleCreativeArchive(creativeId, !!isArchived, req.user.id);
    
    res.json({ data: creative });
  } catch (error: any) {
    logger.error(error, 'Error archiving creative');
    if (error.message === 'Creative not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to archive creative' });
  }
});

export default statusRouter;

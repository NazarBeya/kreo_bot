import { getClient, query } from '../db/pool.js';
import type { CreativeStatus, TestingStatus, TestVolume, ROICategory } from '../types/domain.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getNumericSetting } from './admin-settings.js';
import { createNotification, notifyCreativeBurnout } from './notifications.js';

export interface SetStatusInput {
  creativeId: string;
  buyerId: string;
  geoCode: string;
  status: TestingStatus;
  testVolume?: TestVolume;
  roiCategory?: ROICategory;
  comment?: string;
}

const calculateAggregatedStatus = (statuses: TestingStatus[]): CreativeStatus => {
  if (statuses.length === 0) return 'new';
  
  if (statuses.includes('working') || statuses.includes('resurrected')) {
    return 'working';
  }
  
  if (statuses.includes('fading')) {
    return 'fading';
  }

  if (statuses.includes('testing')) {
    return 'new';
  }

  const allDead = statuses.every((s) => s === 'dead');
  if (allDead) {
    return 'dead';
  }
  
  return 'new';
};

export const setCreativeStatus = async (input: SetStatusInput) => {
  const client = await getClient();
  let shouldNotifyBurnout = false;
  let burnoutNegativeCount = 0;
  
  try {
    await client.query('BEGIN');
    const negativeThreshold = await getNumericSetting('negative_status_threshold');
    const negativeWindowDays = await getNumericSetting('negative_status_window_days');

    const creativeBeforeResult = await client.query(
      `SELECT aggregated_status
       FROM creatives
       WHERE id = $1
       FOR UPDATE`,
      [input.creativeId]
    );

    if (creativeBeforeResult.rows.length === 0) {
      throw new Error('Creative not found');
    }

    const previousAggregatedStatus = creativeBeforeResult.rows[0].aggregated_status as CreativeStatus;

    await client.query(
      `INSERT INTO creative_statuses (creative_id, buyer_id, geo_code, status, test_volume, roi_category, comment, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (creative_id, buyer_id, geo_code) 
       DO UPDATE SET 
         status = EXCLUDED.status,
         test_volume = EXCLUDED.test_volume,
         roi_category = EXCLUDED.roi_category,
         comment = EXCLUDED.comment,
         updated_at = NOW()`,
      [
        input.creativeId,
        input.buyerId,
        input.geoCode,
        input.status,
        input.testVolume,
        input.roiCategory,
        input.comment,
      ]
    );

    const statusesResult = await client.query(
      `SELECT status FROM creative_statuses WHERE creative_id = $1`,
      [input.creativeId]
    );
    const negativeStatusesResult = await client.query(
      `SELECT COUNT(*)::INT AS count
       FROM creative_statuses
       WHERE creative_id = $1
         AND updated_at >= NOW() - $2 * INTERVAL '1 day'
         AND (
           status IN ('fading', 'dead')
           OR roi_category = 'red'
         )`,
      [input.creativeId, negativeWindowDays]
    );
    burnoutNegativeCount = Number(negativeStatusesResult.rows[0]?.count || 0);
    const isAutoBurnout = input.status !== 'resurrected' && burnoutNegativeCount >= negativeThreshold;
    const allStatuses = statusesResult.rows.map((row: any) => row.status as TestingStatus);
    const newAggregatedStatus = isAutoBurnout ? 'fading' : calculateAggregatedStatus(allStatuses);
    shouldNotifyBurnout = isAutoBurnout && previousAggregatedStatus !== 'fading';

    await client.query(
      `UPDATE creatives 
       SET aggregated_status = $1, 
           updated_at = NOW()
       WHERE id = $2`,
      [newAggregatedStatus, input.creativeId]
    );

    await client.query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
       VALUES ($1, 'status_change', 'creative', $2, $3)`,
      [
        input.buyerId,
        input.creativeId,
        JSON.stringify({
          geo: input.geoCode,
          new_status: input.status,
          aggregated_status: newAggregatedStatus,
          auto_burnout: isAutoBurnout,
          negative_statuses_14d: burnoutNegativeCount,
        }),
      ]
    );

    if (isAutoBurnout) {
      await client.query(
        `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
         VALUES ($1, 'burnout', 'creative', $2, $3)`,
        [
          input.buyerId,
          input.creativeId,
          JSON.stringify({
            aggregated_status: newAggregatedStatus,
            negative_statuses_14d: burnoutNegativeCount,
            window_days: negativeWindowDays,
            threshold: negativeThreshold,
          }),
        ]
      );
    }

    const authorResult = await client.query(
      `SELECT c.author_id, c.short_id, u.username, u.display_name
       FROM creatives c
       JOIN users u ON u.id = $1
       WHERE c.id = $2`,
      [input.buyerId, input.creativeId]
    );
    const authorId = authorResult.rows[0]?.author_id;
    const shortId = authorResult.rows[0]?.short_id;
    const buyerName = authorResult.rows[0]?.username
      ? `@${authorResult.rows[0].username}`
      : authorResult.rows[0]?.display_name || 'баєр';

    await client.query('COMMIT');

    if (authorId && authorId !== input.buyerId) {
      try {
        await createNotification(authorId, 'status_update', {
          creativeId: input.creativeId,
          shortId,
          status: input.status,
          geoCode: input.geoCode,
          text: `${buyerName} поставив «${input.status}» на ${shortId} (${input.geoCode})`,
        });
      } catch (notificationError) {
        logger.error(notificationError, 'Error sending status update notification');
      }
    }

    if (shouldNotifyBurnout) {
      try {
        await notifyCreativeBurnout(input.creativeId, burnoutNegativeCount);
      } catch (notificationError) {
        logger.error(notificationError, 'Error sending burnout notifications');
      }
    }
    
    return {
      aggregatedStatus: newAggregatedStatus,
      autoBurnout: isAutoBurnout,
      negativeStatuses14d: burnoutNegativeCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(error, 'Error setting creative status');
    throw error;
  } finally {
    client.release();
  }
};

export const archiveDeadCreatives = async (daysThreshold?: number) => {
  try {
    const effectiveDaysThreshold = daysThreshold || await getNumericSetting('auto_archive_dead_days');
    const result = await query(
      `UPDATE creatives 
       SET is_archived = true, updated_at = NOW()
       WHERE aggregated_status = 'dead' 
         AND is_archived = false 
         AND updated_at < NOW() - $1 * INTERVAL '1 day'
       RETURNING id`,
      [effectiveDaysThreshold]
    );
    
    if (result.rows.length > 0) {
      logger.info({ count: result.rows.length }, 'Auto-archived dead creatives');
    }
    return result.rows.length;
  } catch (error) {
    logger.error(error, 'Error auto-archiving creatives');
    throw error;
  }
};

export const pruneDownloadLogs = async (retentionDays = config.operations.downloadLogRetentionDays) => {
  try {
    const result = await query(
      `DELETE FROM downloads
       WHERE created_at < NOW() - $1 * INTERVAL '1 day'
       RETURNING id`,
      [retentionDays]
    );

    if (result.rows.length > 0) {
      logger.info({ count: result.rows.length, retentionDays }, 'Pruned old download logs');
    }

    return result.rows.length;
  } catch (error) {
    logger.error(error, 'Error pruning download logs');
    throw error;
  }
};

export const toggleCreativeArchive = async (creativeId: string, isArchived: boolean, userId: string) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE creatives 
       SET is_archived = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [isArchived, creativeId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Creative not found');
    }

    await client.query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, 'creative', $3, $4)`,
      [
        userId,
        isArchived ? 'archive' : 'unarchive',
        creativeId,
        JSON.stringify({ status: result.rows[0].aggregated_status }),
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(error, 'Error toggling archive status');
    throw error;
  } finally {
    client.release();
  }
};

let workerStarted = false;

export const startStatusWorker = () => {
  if (workerStarted) return;
  workerStarted = true;

  logger.info('Status worker started (auto-archiving dead creatives and pruning logs)');
  
  void (async () => {
    await archiveDeadCreatives(await getNumericSetting('auto_archive_dead_days'));
    await pruneDownloadLogs();
  })();
  const interval = setInterval(() => {
    if (!workerStarted) {
      clearInterval(interval);
      return;
    }
    void (async () => {
      await archiveDeadCreatives(await getNumericSetting('auto_archive_dead_days'));
      await pruneDownloadLogs();
    })();
  }, 12 * 60 * 60 * 1000);
};

export const stopStatusWorker = () => {
  workerStarted = false;
};

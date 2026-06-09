import redis from '../db/redis.js';
import { query } from '../db/pool.js';
import { bot } from '../bot/index.js';
import { logger } from '../logger.js';
import type { Creative } from '../types/domain.js';
import { getNumericSetting } from './admin-settings.js';

type NotificationType = 'new_creative' | 'download' | 'reminder' | 'resurrection' | 'burnout' | 'comment' | 'mention' | 'status_update';

interface NotificationJob {
  notificationId: string;
  userId: string;
}

interface ReminderJob {
  userId: string;
  text: string;
}

const immediateQueue = 'queue:notifications';
const delayedQueue = 'queue:notifications:delayed';
let workerStarted = false;
let lastDisciplineRunAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const enqueueNotification = async (job: NotificationJob) => {
  await redis.lpush(immediateQueue, JSON.stringify(job));
};

export const scheduleReminder = async (job: ReminderJob, runAt: Date) => {
  await redis.zadd(delayedQueue, runAt.getTime(), JSON.stringify(job));
};

export const createNotification = async (
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>
) => {
  const result = await query(
    `INSERT INTO notifications (user_id, type, payload)
     VALUES ($1, $2, $3)
     RETURNING id, user_id`,
    [userId, type, payload]
  );
  const notification = result.rows[0];
  await enqueueNotification({ notificationId: notification.id, userId: notification.user_id });
  return notification;
};

export const notifySubscribersAboutCreative = async (creative: Creative) => {
  const result = await query(
    `SELECT DISTINCT s.user_id
     FROM subscriptions s
     WHERE (s.geo_code IS NULL OR s.geo_code = ANY($1::TEXT[]))
       AND (s.angle IS NULL OR s.angle = ANY($2::TEXT[]))`,
    [creative.geos || [], creative.angles || []]
  );

  await Promise.all(
    result.rows.map((row: { user_id: string }) =>
      createNotification(row.user_id, 'new_creative', {
        creativeId: creative.id,
        shortId: creative.shortId || (creative as any).short_id,
        geos: creative.geos,
        angles: creative.angles,
      })
    )
  );
};

export const notifyCreativeResurrected = async (
  creative: Creative,
  actor: { id: string; username?: string; display_name?: string }
) => {
  const result = await query(
    `SELECT DISTINCT user_id
     FROM (
       SELECT c.author_id AS user_id
       FROM creatives c
       WHERE c.id = $1

       UNION

       SELECT b.user_id
       FROM bookmarks b
       WHERE b.creative_id = $1

       UNION

       SELECT s.user_id
       FROM subscriptions s
       WHERE (s.geo_code IS NULL OR s.geo_code = ANY($2::TEXT[]))
         AND (s.angle IS NULL OR s.angle = ANY($3::TEXT[]))
     ) recipients
     WHERE user_id IS NOT NULL AND user_id <> $4`,
    [creative.id, creative.geos || [], creative.angles || [], actor.id]
  );

  const actorName = actor.username ? `@${actor.username}` : actor.display_name || 'команда';

  await Promise.all(
    result.rows.map((row: { user_id: string }) =>
      createNotification(row.user_id, 'resurrection', {
        creativeId: creative.id,
        shortId: creative.shortId || (creative as any).short_id,
        geos: creative.geos,
        angles: creative.angles,
        actor: actorName,
        text: `Крео ${creative.shortId || (creative as any).short_id} воскресло через ${actorName}`,
      })
    )
  );
};

export const notifyCreativeBurnout = async (creativeId: string, negativeCount: number) => {
  const creativeResult = await query(
    `SELECT c.id,
            c.short_id,
            c.author_id,
            array_remove(array_agg(DISTINCT cg.geo_code), NULL) AS geos,
            array_remove(array_agg(DISTINCT ca.angle), NULL) AS angles
     FROM creatives c
     LEFT JOIN creative_geos cg ON c.id = cg.creative_id
     LEFT JOIN creative_angles ca ON c.id = ca.creative_id
     WHERE c.id = $1
     GROUP BY c.id`,
    [creativeId]
  );
  const creative = creativeResult.rows[0];

  if (!creative) {
    return;
  }

  const recipientsResult = await query(
    `SELECT DISTINCT user_id
     FROM (
       SELECT $2::UUID AS user_id

       UNION

       SELECT d.user_id
       FROM downloads d
       WHERE d.creative_id = $1

       UNION

       SELECT b.user_id
       FROM bookmarks b
       WHERE b.creative_id = $1
     ) recipients
     WHERE user_id IS NOT NULL`,
    [creativeId, creative.author_id]
  );

  await Promise.all(
    recipientsResult.rows.map((row: { user_id: string }) =>
      createNotification(row.user_id, 'burnout', {
        creativeId,
        shortId: creative.short_id,
        geos: creative.geos || [],
        angles: creative.angles || [],
        negativeCount,
        text: `Крео ${creative.short_id} вигорає: ${negativeCount} негативні статуси за 14 днів`,
      })
    )
  );
};

export const notifyCreativeDownloaded = async (
  creative: Creative,
  downloader: { id: string; username?: string; display_name?: string }
) => {
  const authorId = creative.authorId || (creative as any).author_id;

  if (!authorId || authorId === downloader.id) {
    return;
  }

  const downloaderName = downloader.username ? `@${downloader.username}` : downloader.display_name || 'користувач';
  await createNotification(authorId, 'download', {
    creativeId: creative.id,
    shortId: creative.shortId || (creative as any).short_id,
    downloader: downloaderName,
    text: `${downloaderName} скачав твоє крео ${creative.shortId || (creative as any).short_id}`,
  });
};

export const processDownloadDiscipline = async () => {
  const reminderDays = await getNumericSetting('download_reminder_days');
  const restrictionDays = await getNumericSetting('download_restriction_days');
  const overdueResult = await query(
    `WITH latest_downloads AS (
       SELECT d.user_id,
              d.creative_id,
              MAX(d.created_at) AS downloaded_at
       FROM downloads d
       JOIN users u ON u.id = d.user_id
       WHERE u.role IN ('buyer', 'lead')
       GROUP BY d.user_id, d.creative_id
     ),
     overdue AS (
       SELECT ld.user_id,
              ld.creative_id,
              ld.downloaded_at,
              c.short_id
       FROM latest_downloads ld
       JOIN creatives c ON c.id = ld.creative_id
       WHERE ld.downloaded_at <= NOW() - $1 * INTERVAL '1 day'
         AND NOT EXISTS (
           SELECT 1
           FROM creative_statuses cs
           WHERE cs.creative_id = ld.creative_id
             AND cs.buyer_id = ld.user_id
             AND cs.updated_at >= ld.downloaded_at
         )
     )
     SELECT o.*,
            (
              SELECT MAX(n.created_at)
              FROM notifications n
              WHERE n.user_id = o.user_id
                AND n.type = 'reminder'
                AND n.payload->>'creativeId' = o.creative_id::TEXT
                AND n.payload->>'reason' = 'download_status_overdue'
            ) AS last_reminder_at
     FROM overdue o`,
    [reminderDays]
  );

  for (const row of overdueResult.rows) {
    const lastReminderAt = row.last_reminder_at ? new Date(row.last_reminder_at).getTime() : 0;
    const reminderDue = !lastReminderAt || lastReminderAt <= Date.now() - reminderDays * 24 * 60 * 60 * 1000;

    if (reminderDue) {
      await createNotification(row.user_id, 'reminder', {
        creativeId: row.creative_id,
        shortId: row.short_id,
        reason: 'download_status_overdue',
        text: `Постав статус для ${row.short_id}: минуло ${reminderDays} днів після скачування`,
      });
    }
  }

  const restrictedResult = await query(
    `WITH latest_downloads AS (
       SELECT d.user_id,
              d.creative_id,
              MAX(d.created_at) AS downloaded_at
       FROM downloads d
       JOIN users u ON u.id = d.user_id
       WHERE u.role IN ('buyer', 'lead')
       GROUP BY d.user_id, d.creative_id
     ),
     overdue AS (
       SELECT ld.user_id,
              ld.creative_id
       FROM latest_downloads ld
       WHERE ld.downloaded_at <= NOW() - $1 * INTERVAL '1 day'
         AND NOT EXISTS (
           SELECT 1
           FROM creative_statuses cs
           WHERE cs.creative_id = ld.creative_id
             AND cs.buyer_id = ld.user_id
             AND cs.updated_at >= ld.downloaded_at
         )
     ),
     restriction_candidates AS (
       SELECT DISTINCT o.user_id
       FROM overdue o
       JOIN notifications n ON n.user_id = o.user_id
        AND n.type = 'reminder'
        AND n.payload->>'creativeId' = o.creative_id::TEXT
        AND n.payload->>'reason' = 'download_status_overdue'
        AND n.created_at <= NOW() - $2 * INTERVAL '1 day'
     )
     UPDATE users u
     SET download_restricted_until = NOW() + $2 * INTERVAL '1 day'
     FROM restriction_candidates rc
     WHERE u.id = rc.user_id
       AND (u.download_restricted_until IS NULL OR u.download_restricted_until < NOW() + $2 * INTERVAL '1 day')
     RETURNING u.id`,
    [reminderDays, restrictionDays]
  );

  const releasedResult = await query(
    `WITH latest_downloads AS (
       SELECT d.user_id,
              d.creative_id,
              MAX(d.created_at) AS downloaded_at
       FROM downloads d
       GROUP BY d.user_id, d.creative_id
     ),
     overdue_users AS (
       SELECT DISTINCT ld.user_id
     FROM latest_downloads ld
       WHERE ld.downloaded_at <= NOW() - $1 * INTERVAL '1 day'
         AND NOT EXISTS (
           SELECT 1
           FROM creative_statuses cs
           WHERE cs.creative_id = ld.creative_id
             AND cs.buyer_id = ld.user_id
             AND cs.updated_at >= ld.downloaded_at
         )
     )
     UPDATE users u
     SET download_restricted_until = NULL
     WHERE u.download_restricted_until IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM overdue_users ou WHERE ou.user_id = u.id
       )
     RETURNING u.id`,
    [reminderDays]
  );

  if (overdueResult.rows.length || restrictedResult.rows.length || releasedResult.rows.length) {
    logger.info(
      {
        remindersChecked: overdueResult.rows.length,
        restricted: restrictedResult.rows.length,
        released: releasedResult.rows.length,
      },
      'Processed download discipline'
    );
  }
};

export const processOptionalMetadataReminders = async () => {
  const reminderDays = await getNumericSetting('optional_metadata_reminder_days');
  const result = await query(
    `SELECT c.id,
            c.short_id,
            c.author_id,
            c.created_at,
            array_remove(ARRAY[
              CASE WHEN NULLIF(TRIM(COALESCE(c.language, '')), '') IS NULL THEN 'language' END,
              CASE WHEN NULLIF(TRIM(COALESCE(c.preland, '')), '') IS NULL THEN 'preland' END,
              CASE WHEN NULLIF(TRIM(COALESCE(c.author_comment, '')), '') IS NULL THEN 'author_comment' END
            ], NULL) AS missing_fields
     FROM creatives c
     WHERE c.created_at <= NOW() - $1 * INTERVAL '1 day'
       AND c.moderation_status <> 'rejected'
       AND (
         NULLIF(TRIM(COALESCE(c.language, '')), '') IS NULL
         OR NULLIF(TRIM(COALESCE(c.preland, '')), '') IS NULL
         OR NULLIF(TRIM(COALESCE(c.author_comment, '')), '') IS NULL
       )
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.user_id = c.author_id
           AND n.type = 'reminder'
           AND n.payload->>'creativeId' = c.id::TEXT
           AND n.payload->>'reason' = 'optional_metadata_missing'
           AND n.created_at >= c.created_at
       )
     ORDER BY c.created_at ASC
     LIMIT 100`,
    [reminderDays]
  );

  for (const creative of result.rows) {
    const missingFields = creative.missing_fields || [];
    await createNotification(creative.author_id, 'reminder', {
      creativeId: creative.id,
      shortId: creative.short_id,
      reason: 'optional_metadata_missing',
      missingFields,
      text: `Заповни optional поля для ${creative.short_id}: ${missingFields.join(', ')}`,
    });
  }

  if (result.rows.length > 0) {
    logger.info({ count: result.rows.length }, 'Processed optional metadata reminders');
  }
};

export const processAuthorLifecycleReminders = async () => {
  const reminderDays = await getNumericSetting('author_lifecycle_reminder_days');
  const result = await query(
    `SELECT c.id,
            c.short_id,
            c.author_id,
            c.author_lifecycle_status,
            c.author_lifecycle_updated_at
     FROM creatives c
     WHERE c.is_archived = false
       AND c.moderation_status <> 'rejected'
       AND c.author_lifecycle_status <> 'not_running'
       AND c.author_lifecycle_updated_at <= NOW() - $1 * INTERVAL '1 day'
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.user_id = c.author_id
           AND n.type = 'reminder'
           AND n.payload->>'creativeId' = c.id::TEXT
           AND n.payload->>'reason' = 'author_lifecycle_due'
           AND n.created_at >= NOW() - $1 * INTERVAL '1 day'
       )
     ORDER BY c.author_lifecycle_updated_at ASC
     LIMIT 100`,
    [reminderDays]
  );

  for (const creative of result.rows) {
    await createNotification(creative.author_id, 'reminder', {
      creativeId: creative.id,
      shortId: creative.short_id,
      reason: 'author_lifecycle_due',
      lifecycleStatus: creative.author_lifecycle_status,
      reminderDays,
      text: `Онови статус ${creative.short_id}: актуальний, вигорає чи не лию`,
    });
  }

  if (result.rows.length > 0) {
    logger.info({ count: result.rows.length }, 'Processed author lifecycle reminders');
  }
};

const sendNotification = async (job: NotificationJob) => {
  const result = await query(
    `SELECT n.id, n.type, n.payload, u.telegram_id
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     JOIN notification_settings ns ON ns.user_id = n.user_id AND ns.type = n.type
     WHERE n.id = $1 AND ns.is_enabled = true
     UNION
     SELECT n.id, n.type, n.payload, u.telegram_id
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     WHERE n.id = $1
       AND NOT EXISTS (
         SELECT 1 FROM notification_settings ns
         WHERE ns.user_id = n.user_id AND ns.type = n.type
       )
     LIMIT 1`,
    [job.notificationId]
  );
  const notification = result.rows[0];

  if (!notification) {
    return;
  }

  const text = notification.type === 'new_creative'
    ? `New creative ${notification.payload.shortId || notification.payload.creativeId} for ${(notification.payload.geos || []).join(', ')}`
    : notification.type === 'download'
      ? String(notification.payload.text || `Creative ${notification.payload.shortId || notification.payload.creativeId} downloaded`)
    : notification.type === 'resurrection'
      ? String(notification.payload.text || `Creative ${notification.payload.shortId || notification.payload.creativeId} resurrected`)
      : notification.type === 'burnout'
        ? String(notification.payload.text || `Creative ${notification.payload.shortId || notification.payload.creativeId} is burning out`)
      : String(notification.payload.text || 'Reminder');
  const lifecycleKeyboard = notification.type === 'reminder'
    && notification.payload?.reason === 'author_lifecycle_due'
    && notification.payload?.creativeId
    ? {
        inline_keyboard: [
          [
            { text: 'актуальний', callback_data: `lc:${notification.payload.creativeId}:actual` },
            { text: 'вигорає', callback_data: `lc:${notification.payload.creativeId}:fading` },
          ],
          [
            { text: 'вже не лию', callback_data: `lc:${notification.payload.creativeId}:not_running` },
          ],
        ],
      }
    : undefined;

  await bot.api.sendMessage(notification.telegram_id, text, {
    protect_content: true,
    reply_markup: lifecycleKeyboard,
  });
};

const promoteDelayedJobs = async () => {
  const now = Date.now();
  const jobs = await redis.zrangebyscore(delayedQueue, 0, now, 'LIMIT', 0, 100);

  for (const raw of jobs) {
    const removed = await redis.zrem(delayedQueue, raw);

    if (removed) {
      const reminder = JSON.parse(raw) as ReminderJob;
      await createNotification(reminder.userId, 'reminder', { text: reminder.text });
    }
  }
};

const processDownloadDisciplineIfDue = async () => {
  const now = Date.now();

  if (lastDisciplineRunAt && now - lastDisciplineRunAt < 60 * 60 * 1000) {
    return;
  }

  lastDisciplineRunAt = now;
  await processDownloadDiscipline();
  await processOptionalMetadataReminders();
  await processAuthorLifecycleReminders();
};

export const startNotificationWorker = () => {
  if (workerStarted) {
    return;
  }

  workerStarted = true;

  void (async () => {
    logger.info('Notification worker started');

    while (workerStarted) {
      try {
        await promoteDelayedJobs();
        await processDownloadDisciplineIfDue();
        const item = await redis.brpop(immediateQueue, 5);

        if (item) {
          await sendNotification(JSON.parse(item[1]) as NotificationJob);
        }
      } catch (error) {
        logger.error(error, 'Notification worker error');
        await sleep(2000);
      }
    }
  })();
};

export const stopNotificationWorker = () => {
  workerStarted = false;
};

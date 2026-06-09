import { ensureOperationalSchema } from '../db/schema.js';
import { logger } from '../logger.js';
import { getNumericSetting } from '../services/admin-settings.js';
import {
  processAuthorLifecycleReminders,
  processDownloadDiscipline,
  processOptionalMetadataReminders,
} from '../services/notifications.js';
import { archiveDeadCreatives, pruneDownloadLogs } from '../services/status.js';

const runMaintenance = async () => {
  await ensureOperationalSchema();

  const archivedCount = await archiveDeadCreatives(await getNumericSetting('auto_archive_dead_days'));
  const prunedDownloads = await pruneDownloadLogs();
  await processDownloadDiscipline();
  await processOptionalMetadataReminders();
  await processAuthorLifecycleReminders();

  logger.info({ archivedCount, prunedDownloads }, 'Maintenance jobs completed');
};

runMaintenance()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error, 'Maintenance jobs failed');
    process.exit(1);
  });

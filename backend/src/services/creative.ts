import { getClient, query } from '../db/pool.js';
import type { Creative, CreativeStatus } from '../types/domain.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { generateCreativeId } from '../utils/crypto.js';
import { getBooleanSetting } from './admin-settings.js';
import { getSignedUrl } from './storage.js';

export interface CreateCreativeInput {
  fileUrl: string;
  previewUrl: string;
  fileHash: string;
  fileType: 'video' | 'image';
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
  width: number;
  height: number;
  authorId: string;
  geos: string[];
  angles: string[];
  language?: string;
  preland?: string;
  authorComment?: string;
  parentCreativeId?: string;
}

export const createCreative = async (input: CreateCreativeInput): Promise<Creative> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const shortId = generateCreativeId();
    const moderationEnabled = await getBooleanSetting('moderation_enabled');
    const moderationStatus = moderationEnabled ? 'pending_review' : 'approved';

    const creativeResult = await client.query(
      `INSERT INTO creatives (
        short_id, file_url, preview_url, file_hash, file_type, mime_type,
        size_bytes, duration_sec, width, height, author_id, language, preland, author_comment, parent_creative_id,
        moderation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        shortId,
        input.fileUrl,
        input.previewUrl,
        input.fileHash,
        input.fileType,
        input.mimeType,
        input.sizeBytes,
        input.durationSec,
        input.width,
        input.height,
        input.authorId,
        input.language,
        input.preland,
        input.authorComment,
        input.parentCreativeId,
        moderationStatus,
      ]
    );

    const creative = creativeResult.rows[0];

    for (const geo of input.geos) {
      await client.query(
        'INSERT INTO creative_geos (creative_id, geo_code) VALUES ($1, $2)',
        [creative.id, geo]
      );
    }

    for (const angle of input.angles) {
      await client.query(
        'INSERT INTO creative_angles (creative_id, angle) VALUES ($1, $2)',
        [creative.id, angle]
      );
    }

    await client.query('COMMIT');

    return await getCreativeById(creative.id) as Creative;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(error, 'Error creating creative');
    throw error;
  } finally {
    client.release();
  }
};

export const getCreativeById = async (id: string): Promise<Creative | null> => {
  try {
    const result = await query(
      `SELECT c.*, 
              u.username as author_username,
              u.display_name as author_display_name,
              p.short_id as parent_short_id,
              array_agg(DISTINCT cg.geo_code) as geos,
              array_agg(DISTINCT ca.angle) as angles,
              COUNT(DISTINCT cs.id)::INT as tester_count,
              COUNT(DISTINCT cm.id)::INT as comment_count
       FROM creatives c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN creatives p ON p.id = c.parent_creative_id
       LEFT JOIN creative_geos cg ON c.id = cg.creative_id
       LEFT JOIN creative_angles ca ON c.id = ca.creative_id
       LEFT JOIN creative_statuses cs ON c.id = cs.creative_id
       LEFT JOIN comments cm ON c.id = cm.creative_id
       WHERE c.id = $1
       GROUP BY c.id, u.username, u.display_name, p.short_id`,
      [id]
    );

    const creative = result.rows[0] || null;
    if (creative) {
      creative.file_url = getSignedUrl(creative.file_url, config.signedUrls.previewTtlSeconds);
      creative.preview_url = getSignedUrl(creative.preview_url, config.signedUrls.previewTtlSeconds);
    }
    return creative;
  } catch (error) {
    logger.error(error, 'Error fetching creative');
    throw error;
  }
};

export const getCreativeByShortId = async (shortId: string): Promise<Creative | null> => {
  try {
    const result = await query(
      `SELECT c.*, 
              u.username as author_username,
              u.display_name as author_display_name,
              p.short_id as parent_short_id,
              array_agg(DISTINCT cg.geo_code) as geos,
              array_agg(DISTINCT ca.angle) as angles,
              COUNT(DISTINCT cs.id)::INT as tester_count,
              COUNT(DISTINCT cm.id)::INT as comment_count
       FROM creatives c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN creatives p ON p.id = c.parent_creative_id
       LEFT JOIN creative_geos cg ON c.id = cg.creative_id
       LEFT JOIN creative_angles ca ON c.id = ca.creative_id
       LEFT JOIN creative_statuses cs ON c.id = cs.creative_id
       LEFT JOIN comments cm ON c.id = cm.creative_id
       WHERE c.short_id = $1
       GROUP BY c.id, u.username, u.display_name, p.short_id`,
      [shortId]
    );

    const creative = result.rows[0] || null;
    if (creative) {
      creative.file_url = getSignedUrl(creative.file_url, config.signedUrls.previewTtlSeconds);
      creative.preview_url = getSignedUrl(creative.preview_url, config.signedUrls.previewTtlSeconds);
    }
    return creative;
  } catch (error) {
    logger.error(error, 'Error fetching creative by short_id');
    throw error;
  }
};

export const getCreativeVersionHistory = async (creativeId: string) => {
  const result = await query(
    `WITH RECURSIVE ancestors AS (
       SELECT c.id, c.parent_creative_id
       FROM creatives c
       WHERE c.id = $1

       UNION ALL

       SELECT parent.id, parent.parent_creative_id
       FROM creatives parent
       JOIN ancestors child ON child.parent_creative_id = parent.id
     ),
     root AS (
       SELECT id
       FROM ancestors
       WHERE parent_creative_id IS NULL
       LIMIT 1
     ),
     version_tree AS (
       SELECT c.id,
              c.parent_creative_id,
              1 AS depth
       FROM creatives c
       JOIN root r ON c.id = r.id

       UNION ALL

       SELECT child.id,
              child.parent_creative_id,
              vt.depth + 1
       FROM creatives child
       JOIN version_tree vt ON child.parent_creative_id = vt.id
     )
     SELECT c.id,
            c.short_id,
            c.parent_creative_id,
            p.short_id AS parent_short_id,
            c.aggregated_status,
            c.author_lifecycle_status,
            c.created_at,
            vt.depth AS version_number,
            array_remove(array_agg(DISTINCT cg.geo_code), NULL) AS geos,
            array_remove(array_agg(DISTINCT ca.angle), NULL) AS angles
     FROM version_tree vt
     JOIN creatives c ON c.id = vt.id
     LEFT JOIN creatives p ON p.id = c.parent_creative_id
     LEFT JOIN creative_geos cg ON cg.creative_id = c.id
     LEFT JOIN creative_angles ca ON ca.creative_id = c.id
     GROUP BY c.id, p.short_id, vt.depth
     ORDER BY vt.depth ASC, c.created_at ASC`,
    [creativeId]
  );

  return result.rows;
};

export const searchCreatives = async (
  geos?: string[],
  angles?: string[],
  status?: CreativeStatus,
  limit: number = 20,
  offset: number = 0,
  authorId?: string,
  archivedOnly: boolean = false
): Promise<{ creatives: Creative[]; total: number }> => {
  try {
    const params: any[] = [];
    const addParam = (value: any) => {
      params.push(value);
      return `$${params.length}`;
    };

    let whereConditions = [
      archivedOnly ? 'c.is_archived = true' : 'c.is_archived = false',
      "c.moderation_status = 'approved'",
    ];

    if (status) {
      whereConditions.push(`c.aggregated_status = ${addParam(status)}`);
    }

    let query_text = `
      SELECT c.*, 
             u.username as author_username,
             u.display_name as author_display_name,
             p.short_id as parent_short_id,
             array_agg(DISTINCT cg.geo_code) as geos,
             array_agg(DISTINCT ca.angle) as angles,
             COUNT(DISTINCT cs.id)::INT as tester_count,
             COUNT(DISTINCT cm.id)::INT as comment_count
      FROM creatives c
      JOIN users u ON u.id = c.author_id
      LEFT JOIN creatives p ON p.id = c.parent_creative_id
      LEFT JOIN creative_geos cg ON c.id = cg.creative_id
      LEFT JOIN creative_angles ca ON c.id = ca.creative_id
      LEFT JOIN creative_statuses cs ON c.id = cs.creative_id
      LEFT JOIN comments cm ON c.id = cm.creative_id
    `;

    if (geos && geos.length > 0) {
      query_text += ` LEFT JOIN creative_geos cg2 ON c.id = cg2.creative_id`;
      whereConditions.push(`cg2.geo_code = ANY(${addParam(geos)}::TEXT[])`);
    }

    if (angles && angles.length > 0) {
      query_text += ` LEFT JOIN creative_angles ca2 ON c.id = ca2.creative_id`;
      whereConditions.push(`ca2.angle = ANY(${addParam(angles)}::TEXT[])`);
    }

    if (authorId) {
      whereConditions.push(`c.author_id = ${addParam(authorId)}`);
    }

    query_text += ` WHERE ${whereConditions.join(' AND ')}`;
    const countParams = [...params];
    query_text += ` GROUP BY c.id, u.username, u.display_name, p.short_id ORDER BY c.created_at DESC LIMIT ${addParam(limit)} OFFSET ${addParam(offset)}`;

    const result = await query(query_text, params);
    
    let countQueryText = `
      SELECT COUNT(DISTINCT c.id) 
      FROM creatives c
    `;
    if (geos && geos.length > 0) countQueryText += ` LEFT JOIN creative_geos cg2 ON c.id = cg2.creative_id`;
    if (angles && angles.length > 0) countQueryText += ` LEFT JOIN creative_angles ca2 ON c.id = ca2.creative_id`;
    countQueryText += ` WHERE ${whereConditions.join(' AND ')}`;

    const countResult = await query(countQueryText, countParams);

    const creatives = result.rows.map((c: any) => ({
      ...c,
      file_url: getSignedUrl(c.file_url, config.signedUrls.previewTtlSeconds),
      preview_url: getSignedUrl(c.preview_url, config.signedUrls.previewTtlSeconds),
    }));

    return {
      creatives,
      total: parseInt(countResult.rows[0].count, 10),
    };
  } catch (error) {
    logger.error(error, 'Error searching creatives');
    throw error;
  }
};

export const checkDuplicateHash = async (fileHash: string): Promise<Creative | null> => {
  try {
    const result = await query(
      'SELECT id, short_id, author_id FROM creatives WHERE file_hash = $1 LIMIT 1',
      [fileHash]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error(error, 'Error checking duplicate hash');
    throw error;
  }
};

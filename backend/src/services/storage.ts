import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';

interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

const service = 's3';
const algorithm = 'AWS4-HMAC-SHA256';

const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => crypto.createHmac('sha256', key).update(value).digest();

const encodePath = (path: string) =>
  path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

const getSigningKey = (dateStamp: string) => {
  const dateKey = hmac(`AWS4${config.s3.secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.s3.region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
};

const signRequest = (
  method: string,
  url: URL,
  body: Buffer,
  contentType?: string,
  extraHeaders?: Record<string, string>
): Headers => {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hash(body);

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };

  if (contentType) {
    headers['content-type'] = contentType;
  }

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join('');
  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${config.s3.region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', getSigningKey(dateStamp))
    .update(stringToSign)
    .digest('hex');

  const signed = new Headers(headers);
  signed.set(
    'authorization',
    `${algorithm} Credential=${config.s3.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
  return signed;
};

const requestObjectStorage = async (
  method: string,
  path: string,
  body = Buffer.alloc(0),
  contentType?: string,
  extraHeaders?: Record<string, string>
) => {
  const endpoint = new URL(config.s3.endpoint);
  const url = new URL(`${endpoint.pathname.replace(/\/$/, '')}${path}`, endpoint.toString());
  const headers = signRequest(method, url, body, contentType, extraHeaders);

  logger.debug(`[S3] ${method} ${url.toString()}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Object storage ${method} ${path} failed: ${response.status} ${message}`);
    }

    return response;
  } catch (error: any) {
    logger.error(
      { 
        error: error.message, 
        url: url.toString(), 
        method,
        endpoint: config.s3.endpoint,
      }, 
      `[S3] Request failed`
    );
    throw error;
  }
};

export const ensureBucket = async () => {
  if (config.storage.driver === 'local') {
    logger.debug(`[Storage] Ensuring local directory exists: ${config.storage.localDir}`);
    await mkdir(config.storage.localDir, { recursive: true });
    return;
  }

  logger.debug(`[S3] Ensuring bucket exists: ${config.s3.bucket}`);
  try {
    await requestObjectStorage('HEAD', `/${config.s3.bucket}`);
    logger.debug(`[S3] Bucket already exists: ${config.s3.bucket}`);
  } catch (error: any) {
    logger.debug(`[S3] Bucket not found, creating: ${config.s3.bucket}`);
    try {
      await requestObjectStorage('PUT', `/${config.s3.bucket}`);
      logger.info(`[S3] Created bucket: ${config.s3.bucket}`);
    } catch (createError: any) {
      if (!String(createError?.message || '').includes('409')) {
        logger.error({ error: createError }, `[S3] Failed to create bucket`);
        throw createError;
      }
      logger.debug(`[S3] Bucket already exists (409)`);
    }
  }
};

export const extractObjectKey = (fileUrlOrKey: string): string => {
  if (!fileUrlOrKey) {
    return '';
  }

  const localBase = config.apiUrl.replace(/\/$/, '') + '/uploads/';
  if (fileUrlOrKey.startsWith(localBase)) {
    return decodeURIComponent(fileUrlOrKey.substring(localBase.length));
  }

  const publicBase = config.s3.publicUrl.replace(/\/$/, '') + '/' + config.s3.bucket + '/';
  if (fileUrlOrKey.startsWith(publicBase)) {
    return decodeURIComponent(fileUrlOrKey.substring(publicBase.length));
  }

  if (fileUrlOrKey.startsWith('http')) {
    const parts = new URL(fileUrlOrKey).pathname.split('/');
    const bucketIndex = parts.findIndex((part) => part === config.s3.bucket);
    if (bucketIndex >= 0) {
      return decodeURIComponent(parts.slice(bucketIndex + 1).join('/'));
    }
    return decodeURIComponent(parts[parts.length - 1]);
  }

  return fileUrlOrKey.replace(/^\/+/, '');
};

export const getObject = async (fileUrlOrKey: string): Promise<Buffer> => {
  const key = extractObjectKey(fileUrlOrKey);
  if (config.storage.driver === 'local') {
    const filePath = path.join(config.storage.localDir, key);
    return await readFile(filePath);
  }

  const response = await requestObjectStorage('GET', `/${config.s3.bucket}/${encodePath(key)}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export const putObject = async ({ key, body, contentType }: PutObjectInput): Promise<string> => {
  if (config.storage.driver === 'local') {
    const filePath = path.join(config.storage.localDir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    const apiBase = config.apiUrl.replace(/\/$/, '');
    return `${apiBase}/uploads/${encodePath(key)}`;
  }

  await requestObjectStorage('PUT', `/${config.s3.bucket}/${encodePath(key)}`, body, contentType);

  const publicBase = config.s3.publicUrl.replace(/\/$/, '');
  return `${publicBase}/${config.s3.bucket}/${encodePath(key)}`;
};

export const streamCreativeFile = async (
  fileUrlOrKey: string,
  res: Response,
  rangeHeader?: string
): Promise<void> => {
  const key = extractObjectKey(fileUrlOrKey);

  if (config.storage.driver === 'local') {
    const filePath = path.join(config.storage.localDir, key);
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;

    res.setHeader('Accept-Ranges', 'bytes');

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = Number.parseInt(parts[0], 10);
      const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;

      if (Number.isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize.toString());
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', fileSize.toString());
    createReadStream(filePath).pipe(res);
    return;
  }

  const objectPath = `/${config.s3.bucket}/${encodePath(key)}`;
  const extraHeaders = rangeHeader ? { range: rangeHeader } : undefined;
  const response = await requestObjectStorage('GET', objectPath, Buffer.alloc(0), undefined, extraHeaders);
  const contentRange = response.headers.get('content-range');
  const contentLength = response.headers.get('content-length');

  if (response.status === 206) {
    res.status(206);
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }
  }

  res.setHeader('Accept-Ranges', 'bytes');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  const body = response.body;
  if (!body) {
    res.status(500).end();
    return;
  }

  const reader = body.getReader();
  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
    }
  };

  await pump();
};

export const getSignedUrl = (fileUrlOrKey: string, expiresInSeconds: number = 3600): string => {
  if (!fileUrlOrKey) return '';

  if (config.storage.driver === 'local') {
    const key = extractObjectKey(fileUrlOrKey);
    const apiBase = config.apiUrl.replace(/\/$/, '');
    return `${apiBase}/uploads/${encodePath(key)}`;
  }

  const safeExpiresInSeconds = Math.min(
    Math.max(Number.isFinite(expiresInSeconds) ? expiresInSeconds : 900, 60),
    7 * 24 * 60 * 60
  );
  
  let key = fileUrlOrKey;
  const publicBase = config.s3.publicUrl.replace(/\/$/, '') + '/' + config.s3.bucket + '/';
  if (key.startsWith(publicBase)) {
    key = decodeURIComponent(key.substring(publicBase.length));
  } else if (key.startsWith('http')) {
    const parts = new URL(key).pathname.split('/');
    key = decodeURIComponent(parts[parts.length - 1]);
  }

  const method = 'GET';
  const endpoint = new URL(config.s3.publicUrl || config.s3.endpoint);
  const url = new URL(`${endpoint.pathname.replace(/\/$/, '')}/${config.s3.bucket}/${encodePath(key)}`, endpoint.toString());
  
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.s3.region}/${service}/aws4_request`;

  url.searchParams.set('X-Amz-Algorithm', algorithm);
  url.searchParams.set('X-Amz-Credential', `${config.s3.accessKey}/${credentialScope}`);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', safeExpiresInSeconds.toString());
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  const canonicalHeaders = `host:${url.host}\n`;
  const signedHeaders = 'host';
  
  const sortedParams = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%20/g, '+')}`)
    .join('&');
  
  const canonicalRequest = [
    method,
    url.pathname,
    sortedParams,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');

  const signature = crypto
    .createHmac('sha256', getSigningKey(dateStamp))
    .update(stringToSign)
    .digest('hex');

  url.searchParams.set('X-Amz-Signature', signature);
  return url.toString();
};

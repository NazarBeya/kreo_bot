import crypto from 'node:crypto';
import { config } from '../config.js';

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
  contentType?: string
): Headers => {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hash(body);

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
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
  contentType?: string
) => {
  const endpoint = new URL(config.s3.endpoint);
  const url = new URL(`${endpoint.pathname.replace(/\/$/, '')}${path}`, endpoint.toString());
  const headers = signRequest(method, url, body, contentType);

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Object storage ${method} ${path} failed: ${response.status} ${message}`);
  }

  return response;
};

export const ensureBucket = async () => {
  try {
    await requestObjectStorage('HEAD', `/${config.s3.bucket}`);
  } catch {
    try {
      await requestObjectStorage('PUT', `/${config.s3.bucket}`);
    } catch (error: any) {
      if (!String(error?.message || '').includes('409')) {
        throw error;
      }
    }
  }
};

export const putObject = async ({ key, body, contentType }: PutObjectInput): Promise<string> => {
  await requestObjectStorage('PUT', `/${config.s3.bucket}/${encodePath(key)}`, body, contentType);

  const publicBase = config.s3.publicUrl.replace(/\/$/, '');
  return `${publicBase}/${config.s3.bucket}/${encodePath(key)}`;
};

export const getSignedUrl = (fileUrlOrKey: string, expiresInSeconds: number = 3600): string => {
  if (!fileUrlOrKey) return '';

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

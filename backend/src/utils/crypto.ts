import crypto from 'crypto';

export const hashFile = (buffer: Buffer): string => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

export const generateCreativeId = (): string => {
  const prefix = 'CR';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${id}`;
};

export const validateTelegramInitData = (
  initData: string,
  botToken: string
): boolean => {
  const data = new URLSearchParams(initData);
  const hash = data.get('hash');
  
  if (!hash) {
    return false;
  }

  data.delete('hash');

  const dataStr = Array.from(data.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataStr)
    .digest('hex');

  return calculatedHash === hash;
};

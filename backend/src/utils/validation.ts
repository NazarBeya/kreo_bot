export const isValidTelegramId = (id: any): id is number => {
  return typeof id === 'number' && id > 0;
};

export const isValidUsername = (username: string): boolean => {
  return /^[a-zA-Z0-9_]{5,32}$/.test(username);
};

export const isValidGeoCode = (code: string): boolean => {
  return /^[A-Z]{2}$/.test(code);
};

export const isValidFileSize = (bytes: number, maxMb: number = 100): boolean => {
  return bytes <= maxMb * 1024 * 1024;
};

export const isValidImageDimensions = (width: number, height: number): boolean => {
  return width >= 100 && height >= 100;
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const sanitizeString = (str: string, maxLength: number = 500): string => {
  return str
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '');
};

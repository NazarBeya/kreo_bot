const getDownloadExtension = (mimeType?: string, fileType?: 'video' | 'image') => {
  if (mimeType?.includes('quicktime')) {
    return 'mov';
  }
  if (mimeType?.includes('webm')) {
    return 'webm';
  }
  if (mimeType?.includes('png')) {
    return 'png';
  }
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) {
    return 'jpg';
  }

  return fileType === 'video' ? 'mp4' : 'jpg';
};

export const downloadFileToDevice = async (
  downloadUrl: string,
  filename: string,
): Promise<void> => {
  const webApp = window.Telegram?.WebApp;

  if (webApp?.downloadFile) {
    webApp.downloadFile({ url: downloadUrl, file_name: filename });
    return;
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error('Не вдалося завантажити файл');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

export const buildCreativeFilename = (
  shortId: string,
  mimeType?: string,
  fileType?: 'video' | 'image',
) => `${shortId}.${getDownloadExtension(mimeType, fileType)}`;

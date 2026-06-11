import { API_URL } from '../config';

const withAuthToken = (creativeId: string, path: string) => {
  const token = localStorage.getItem('creative_bot_token');
  const params = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_URL}/api/creatives/${creativeId}/${path}${params}`;
};

export const getWatermarkedPreviewUrl = (creativeId: string) => withAuthToken(creativeId, 'preview');

export const getCreativeStreamUrl = (creativeId: string) => withAuthToken(creativeId, 'stream');

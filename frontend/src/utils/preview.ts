import { API_URL } from '../config';

export const getWatermarkedPreviewUrl = (creativeId: string) => {
  const token = localStorage.getItem('creative_bot_token');
  const params = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_URL}/api/creatives/${creativeId}/preview${params}`;
};

import axios from 'axios';
import { API_URL } from './config';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((request) => {
  const token = localStorage.getItem('creative_bot_token');
  const initData = window.Telegram?.WebApp?.initData;

  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }

  if (initData) {
    request.headers['X-Telegram-Init-Data'] = initData;
  }

  return request;
});

export default apiClient;

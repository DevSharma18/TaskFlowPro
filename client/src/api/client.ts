import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

type TokenListener = (token: string | null) => void;
let onTokenUpdate: TokenListener | null = null;

export const setOnTokenUpdate = (listener: TokenListener | null) => {
  onTokenUpdate = listener;
};

export const setAccessToken = (token: string | null) => {
  accessToken = token;
  onTokenUpdate?.(token);
};

export const getAccessToken = () => accessToken;

api.interceptors.request.use((config) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login' && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/auth/refresh', {}, { withCredentials: true })
            .then((res) => {
              if (res.data.success && res.data.data.accessToken) {
                setAccessToken(res.data.data.accessToken);
                return res.data.data.accessToken as string;
              }
              return null;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newToken = await refreshPromise;
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
        throw new Error('Refresh token invalid');
      } catch (refreshErr) {
        setAccessToken(null);
        window.dispatchEvent(new Event('auth:expired'));
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

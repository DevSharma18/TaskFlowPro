import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken: string | null = null;

export interface RefreshSessionResult {
  accessToken: string;
  user: any;
}

let refreshSessionPromise: Promise<RefreshSessionResult | null> | null = null;

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

/**
 * Singleton refresh function to deduplicate concurrent refresh calls
 * across page mount (StrictMode double-invocations) and 401 interceptors.
 */
export const refreshSession = async (): Promise<RefreshSessionResult | null> => {
  if (refreshSessionPromise) {
    return refreshSessionPromise;
  }

  refreshSessionPromise = axios
    .post('/api/auth/refresh', {}, { withCredentials: true })
    .then((res) => {
      if (res.data.success && res.data.data?.accessToken) {
        const { accessToken, user } = res.data.data;
        setAccessToken(accessToken);
        return { accessToken, user };
      }
      return null;
    })
    .catch((err) => {
      setAccessToken(null);
      throw err;
    })
    .finally(() => {
      refreshSessionPromise = null;
    });

  return refreshSessionPromise;
};

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
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/register');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        const result = await refreshSession();
        if (result?.accessToken) {
          originalRequest.headers.Authorization = `Bearer ${result.accessToken}`;
          return api(originalRequest);
        }
        throw new Error('Refresh token invalid');
      } catch (refreshErr) {
        window.dispatchEvent(new Event('auth:expired'));
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

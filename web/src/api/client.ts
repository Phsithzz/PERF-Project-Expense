import axios from "axios";

import { getAccessToken, notifyUnauthorized } from "./token-store";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1",
  timeout: 10_000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      getAccessToken()
    ) {
      notifyUnauthorized();
    }
    return Promise.reject(
      error instanceof Error ? error : new Error("Unknown API error"),
    );
  },
);

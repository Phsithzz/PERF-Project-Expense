import { apiClient } from "./client";
import { toApiError } from "./errors";
import type { AuthSession, User } from "./types";

interface DataResponse<T> {
  data: T;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  try {
    const response = await apiClient.post<DataResponse<AuthSession>>(
      "/auth/login",
      {
        ...input,
        clientType: "web",
      },
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  try {
    const response = await apiClient.post<DataResponse<User>>(
      "/auth/register",
      input,
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function refreshSession(): Promise<AuthSession> {
  try {
    const response = await apiClient.post<DataResponse<AuthSession>>(
      "/auth/refresh",
      {
        clientType: "web",
      },
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout", { clientType: "web" });
  } catch (error) {
    throw toApiError(error);
  }
}

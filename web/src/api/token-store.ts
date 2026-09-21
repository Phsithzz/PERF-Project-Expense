let accessToken: string | null = null;
const listeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function subscribeToUnauthorized(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyUnauthorized(): void {
  accessToken = null;
  listeners.forEach((listener) => listener());
}

export function resetTokenStoreForTests(): void {
  accessToken = null;
  listeners.clear();
}

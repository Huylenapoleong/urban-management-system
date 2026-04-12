export const AUTH_TOKEN_KEY = "auth_token";
export const ACCESS_TOKEN_KEY = "access_token";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function getLegacyStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readWebToken(): string | null {
  const storage = getSessionStorage();

  return (
    storage?.getItem(AUTH_TOKEN_KEY) ??
    storage?.getItem(ACCESS_TOKEN_KEY) ??
    null
  );
}

export function writeWebToken(token: string): void {
  const storage = getSessionStorage();
  storage?.setItem(AUTH_TOKEN_KEY, token);
  storage?.setItem(ACCESS_TOKEN_KEY, token);

  // Clear legacy shared storage so each browser tab keeps its own session.
  const legacyStorage = getLegacyStorage();
  legacyStorage?.removeItem(AUTH_TOKEN_KEY);
  legacyStorage?.removeItem(ACCESS_TOKEN_KEY);
}

export function clearWebToken(): void {
  const storage = getSessionStorage();
  storage?.removeItem(AUTH_TOKEN_KEY);
  storage?.removeItem(ACCESS_TOKEN_KEY);

  const legacyStorage = getLegacyStorage();
  legacyStorage?.removeItem(AUTH_TOKEN_KEY);
  legacyStorage?.removeItem(ACCESS_TOKEN_KEY);
}

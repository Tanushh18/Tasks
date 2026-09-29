import * as SecureStore from "expo-secure-store";
import type { User } from "../types/models";

const ACCESS_TOKEN_KEY = "dt_access_token";
const REFRESH_TOKEN_KEY = "dt_refresh_token";
const USER_KEY = "dt_cached_user";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function loadTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

/** Caches the logged-in user for offline cold-start support. */
export async function saveUser(user: User): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

/** Loads cached user (useful for offline cold-start). */
export async function loadUser(): Promise<User | null> {
  try {
    const json = await SecureStore.getItemAsync(USER_KEY);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Clears cached user on logout. */
export async function clearUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

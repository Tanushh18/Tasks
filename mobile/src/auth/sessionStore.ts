import { clearTokens, loadTokens, saveTokens, type TokenPair } from "./tokenStorage";

let currentTokens: TokenPair | null = null;
let onSessionExpired: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export function getAccessToken(): string | null {
  return currentTokens?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return currentTokens?.refreshToken ?? null;
}

export async function setSessionTokens(tokens: TokenPair): Promise<void> {
  currentTokens = tokens;
  await saveTokens(tokens);
}

export async function restoreSession(): Promise<TokenPair | null> {
  currentTokens = await loadTokens();
  return currentTokens;
}

export async function endSession(): Promise<void> {
  currentTokens = null;
  await clearTokens();
}

export function notifySessionExpired(): void {
  currentTokens = null;
  void clearTokens();
  onSessionExpired?.();
}

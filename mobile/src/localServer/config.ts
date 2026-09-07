import { getJson, setJson } from "../offline/storage";

/**
 * The family's local AI server (see local-server/ at the repo root) is reached through a dev
 * tunnel whose public URL changes whenever the tunnel restarts, so it can never be hardcoded.
 * This is a device-level setting (whoever configured the tunnel on this phone), not per-account
 * data, so — unlike offline/scope.ts's per-user keys — it deliberately lives under one fixed key
 * shared by every account signed into this phone.
 */
const LOCAL_SERVER_URL_KEY = "dt_local_server_url";

/** A sensible starting point so the app works out of the box; expected to be replaced in
 * Settings whenever the family's tunnel restarts and gets a new URL. */
export const DEFAULT_LOCAL_SERVER_URL = "https://1dk6s9ds-3000.inc1.devtunnels.ms";

export async function getLocalServerUrl(): Promise<string> {
  const stored = await getJson<string>(LOCAL_SERVER_URL_KEY);
  return stored || DEFAULT_LOCAL_SERVER_URL;
}

export async function setLocalServerUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/+$/, "");
  await setJson(LOCAL_SERVER_URL_KEY, trimmed);
}

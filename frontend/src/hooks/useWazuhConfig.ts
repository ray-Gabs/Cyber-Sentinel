/**
 * useWazuhConfig — per-user Wazuh connection config stored in localStorage.
 *
 * Key: `wazuh_config_${userId}` where userId comes from the JWT `sub` claim.
 * This means each browser user has their own isolated Wazuh config.
 *
 * The plain helper functions (getWazuhConfig, setWazuhConfig, etc.) are also
 * exported so non-hook files like alertService.ts can use them without
 * needing React context.
 */
import { useState, useCallback } from "react";
import { TOKEN_KEY } from "@/lib/constants";

export interface WazuhConfig {
  apiUrl: string;
  username: string;
  password: string;
}

// ── Helpers (usable outside React components) ──────────────────────

/** Decode the JWT `sub` claim to get the current user ID. */
function getCurrentUserId(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

function configKey(userId: string): string {
  return `wazuh_config_${userId}`;
}

/** Read Wazuh config for the currently logged-in user (or null if not set). */
export function getWazuhConfig(): WazuhConfig | null {
  const userId = getCurrentUserId();
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(configKey(userId));
    return raw ? (JSON.parse(raw) as WazuhConfig) : null;
  } catch {
    return null;
  }
}

/** Persist Wazuh config for the currently logged-in user. */
export function saveWazuhConfig(config: WazuhConfig): void {
  const userId = getCurrentUserId();
  if (!userId) return;
  localStorage.setItem(configKey(userId), JSON.stringify(config));
}

/** Remove Wazuh config for the currently logged-in user. */
export function clearWazuhConfig(): void {
  const userId = getCurrentUserId();
  if (!userId) return;
  localStorage.removeItem(configKey(userId));
}

// ── React hook ─────────────────────────────────────────────────────

/** Hook for reading/writing Wazuh config in React components. */
export function useWazuhConfig() {
  const [config, setConfigState] = useState<WazuhConfig>(
    () => getWazuhConfig() ?? { apiUrl: "", username: "", password: "" }
  );

  const save = useCallback((next: WazuhConfig) => {
    saveWazuhConfig(next);
    setConfigState(next);
  }, []);

  const clear = useCallback(() => {
    clearWazuhConfig();
    setConfigState({ apiUrl: "", username: "", password: "" });
  }, []);

  const isConfigured = config.apiUrl.trim().length > 0;

  return { config, save, clear, isConfigured };
}

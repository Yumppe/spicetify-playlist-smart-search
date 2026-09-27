import { CONFIG_KEY } from './constants.js';
import { state } from './state.js';
import { safeClone } from './utils.js';

export const DEFAULT_CONFIG = {
  enabled: true,
  resultsCollapsed: false,
  showSyntaxHelp: true,
  livePlaylistRefresh: true,
};

export function loadConfig() {
  try {
    const raw = state.S?.LocalStorage?.get?.(CONFIG_KEY) ?? globalThis.localStorage?.getItem?.(CONFIG_KEY);
    if (!raw) return safeClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed?.enabled !== false,
      resultsCollapsed: Boolean(parsed?.resultsCollapsed),
      showSyntaxHelp: parsed?.showSyntaxHelp !== false,
      livePlaylistRefresh: parsed?.livePlaylistRefresh !== false,
    };
  } catch {
    return safeClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config) {
  const raw = JSON.stringify(config);
  try { state.S?.LocalStorage?.set?.(CONFIG_KEY, raw); } catch {}
  try { globalThis.localStorage?.setItem?.(CONFIG_KEY, raw); } catch {}
}

export function updateConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  saveConfig(next);
  return next;
}

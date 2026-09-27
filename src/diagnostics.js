import { VERSION } from './constants.js';
import { state } from './state.js';
import { loadConfig } from './config.js';
import { detectCapabilities } from './spotify/capabilities.js';
import { safeErrorMessage } from './utils.js';

const log = [];
const MAX_LOG = 30;

export function recordDiagnostic(type, detail = '') {
  log.push({ at: new Date().toISOString(), type, detail: safeErrorMessage(detail) });
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
}

function clientVersion() {
  const S = state.S;
  return S?.Platform?.Session?.clientVersion
    ?? S?.Platform?.Session?.client_version
    ?? S?.Platform?.Session?.productState?.client_version
    ?? S?.Platform?.PlatformData?.client_version
    ?? S?.Platform?.PlatformData?.clientVersion
    ?? globalThis.Spicetify?.Platform?.Session?.clientVersion
    ?? 'unknown';
}

function spicetifyVersion() {
  return globalThis.Spicetify?.version ?? globalThis.Spicetify?.Config?.version ?? 'unknown';
}

export function diagnosticsSnapshot() {
  const session = state.playbackSession;
  return {
    extensionVersion: VERSION,
    spotifyClientVersion: clientVersion(),
    spicetifyVersion: spicetifyVersion(),
    playlistId: state.playlistId ? '[present]' : null,
    playlistSource: state.source,
    loadedTracks: state.tracks.length,
    filteredTracks: state.filtered.length,
    queryActive: Boolean(state.query),
    queryErrors: [...state.queryErrors],
    resultView: state.query ? 'smart-search-owned' : 'spotify-native',
    playbackMethod: session?.method ?? null,
    playbackStartMethod: session?.lastStartMethod ?? null,
    playbackActive: Boolean(session?.active),
    playbackIndex: session?.currentIndex ?? null,
    playbackSequenceLength: session?.sequence?.length ?? 0,
    playbackShuffle: session?.shuffle ?? null,
    spotifySort: state.sortState,
    cacheEntries: state.cache.size,
    config: loadConfig(),
    capabilities: detectCapabilities(),
    recentEvents: [...log],
  };
}

export function diagnosticsText() {
  return JSON.stringify(diagnosticsSnapshot(), null, 2);
}

export async function copyDiagnostics() {
  const text = diagnosticsText();
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

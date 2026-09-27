import { CACHE_TTL_MS } from './constants.js';
import { state } from './state.js';
import { on, emit } from './events.js';
import { loadConfig } from './config.js';
import { parseQuery } from './search/parser.js';
import { filterTracks } from './search/matcher.js';
import { playlistIdFromLocation, restoreNativeTracklist, setAdvancedViewState } from './ui/dom.js';
import { renderSmartSearch, clearResultsUi, updatePlaybackUi, maintainSmartSearchView } from './ui/results.js';
import { hookNativeSearch, detachNativeSearch } from './ui/native-search.js';
import { releaseSpotifyNativeFilterSuppression } from './spotify/search-control.js';
import { getPlaylistTracks, invalidatePlaylistCache } from './spotify/playlist-source.js';
import { maintainMutationWatcher, stopMutationWatcher, suspendMutationWatcher } from './spotify/mutation-watcher.js';
import { recordDiagnostic } from './diagnostics.js';
import { consoleError, consoleWarn, safeErrorMessage } from './utils.js';
import { ensureReleaseYears, queryNeedsYearMetadata } from './spotify/year-metadata.js';
import { sortTracks, syncSpotifySortState } from './spotify/sort-bridge.js';
import { maintainSyntaxHelp, clearSyntaxHelp } from './ui/syntax-help.js';

let eventsInstalled = false;

export function setSmartQuery(query) {
  state.query = String(query ?? '');
  const parsed = parseQuery(state.query);
  state.queryAst = parsed.ast;
  state.queryErrors = parsed.errors;
  if (state.query.trim() && !parsed.errors.length) {
    state.filtered = sortTracks(filterTracks(state.tracks, parsed));
    if (!state.loading && state.tracks.length) state.lastError = null;
  } else {
    state.filtered = [];
  }
  renderSmartSearch();
  maintainSyntaxHelp();
  return parsed;
}

export async function loadCurrentPlaylist(force = false, reason = 'load') {
  const playlistId = playlistIdFromLocation();
  if (!playlistId || !loadConfig().enabled) return null;
  if (state.loading && state.loadingPlaylistId === playlistId) return null;

  const generation = ++state.routeGeneration;
  if (force) suspendMutationWatcher(1200);
  state.loading = true;
  state.loadingPlaylistId = playlistId;
  state.lastError = null;
  renderSmartSearch();
  try {
    const result = await getPlaylistTracks(playlistId, { force });
    if (generation !== state.routeGeneration || playlistId !== playlistIdFromLocation()) return null;
    state.playlistId = playlistId;
    state.tracks = result.tracks;
    state.source = result.source;
    state.loading = false;
    state.loadingPlaylistId = null;
    setSmartQuery(state.query);
    recordDiagnostic('playlist-refresh', `${reason}${result.changed ? '; content changed' : ''}`);
    return result;
  } catch (error) {
    if (generation !== state.routeGeneration) return null;
    state.loading = false;
    state.loadingPlaylistId = null;
    state.lastError = safeErrorMessage(error) || 'Could not load playlist.';
    consoleError('Could not load playlist.', error);
    renderSmartSearch();
    return null;
  }
}

async function handleAdvancedInput({ input, value }) {
  syncSpotifySortState();
  const previousQuery = state.query;
  const entering = !previousQuery.trim();
  let parsed = setSmartQuery(value);

  setAdvancedViewState(true);
  maintainSmartSearchView();

  if (parsed.errors.length) return;

  if (entering && state.playlistId) {
    state.smartRefreshPending = true;
    try { await loadCurrentPlaylist(true, 'enter-smart-search'); }
    catch (error) { consoleWarn('Could not refresh playlist before Smart Search.', error); }
    finally { state.smartRefreshPending = false; }
    if (state.query !== value || !input?.isConnected) return;
    parsed = parseQuery(value);
  }

  if (queryNeedsYearMetadata(parsed) && state.tracks.some((track) => track.year == null)) {
    state.yearMetadataLoading = true;
    renderSmartSearch();
    try {
      state.lastYearMetadataSummary = await ensureReleaseYears(state.tracks);
    } catch (error) {
      state.lastYearMetadataSummary = { failed: true, message: safeErrorMessage(error) };
      consoleWarn('Could not load missing release years.', error);
    } finally {
      state.yearMetadataLoading = false;
    }
    if (state.query !== value || !input?.isConnected) return;
    parsed = setSmartQuery(value);
  }

  maintainSmartSearchView();
}

function clearAdvancedQuery() {
  state.query = '';
  state.queryAst = { kind: 'true' };
  state.queryErrors = [];
  state.filtered = [];
  state.smartRefreshPending = false;
  releaseSpotifyNativeFilterSuppression();
  setAdvancedViewState(false);
  renderSmartSearch();
  clearSyntaxHelp();
}

async function refreshAfterMutation({ reason = 'mutation' } = {}) {
  if (!state.playlistId || !loadConfig().livePlaylistRefresh) {
    emit('playlist-refresh-status', { phase: 'unavailable', reason });
    return null;
  }
  emit('playlist-refresh-status', { phase: 'start', reason });
  suspendMutationWatcher(2200);
  invalidatePlaylistCache(state.playlistId, reason);
  const before = state.lastPlaylistFingerprint;
  try {
    const result = await loadCurrentPlaylist(true, reason);
    if (!result) {
      emit('playlist-refresh-status', { phase: 'error', reason, message: 'Playlist refresh did not complete.' });
      return null;
    }
    const changed = Boolean(result?.fingerprint && result.fingerprint !== before);
    emit('playlist-refresh-status', { phase: 'done', reason, changed, trackCount: result.tracks?.length ?? state.tracks.length });
    if (changed && reason !== 'manual-refresh') state.S?.showNotification?.('Smart Search updated after a playlist change.');
    return result;
  } catch (error) {
    const message = safeErrorMessage(error) || 'Playlist refresh failed.';
    emit('playlist-refresh-status', { phase: 'error', reason, message });
    return null;
  }
}

export function installControllerEvents() {
  if (eventsInstalled) return;
  eventsInstalled = true;
  on('advanced-input', (payload) => void handleAdvancedInput(payload));
  on('advanced-cleared', clearAdvancedQuery);
  on('playlist-mutation-candidate', (payload) => void refreshAfterMutation(payload));
  on('manual-playlist-refresh', () => void refreshAfterMutation({ reason: 'manual-refresh' }));
  on('render', () => renderSmartSearch());
  on('playback-update', () => updatePlaybackUi());
  on('config-changed', () => applyConfiguration());
}

export function maintainBindings() {
  hookNativeSearch();
  maintainMutationWatcher();
  if (syncSpotifySortState() && state.query) setSmartQuery(state.query);
  maintainSmartSearchView();
  maintainSyntaxHelp();
}

export async function handleRoute() {
  const config = loadConfig();
  const playlistId = playlistIdFromLocation();
  if (!config.enabled || !playlistId) {
    state.routeGeneration += 1;
    state.playlistId = null;
    state.tracks = [];
    state.filtered = [];
    state.query = '';
    state.queryErrors = [];
    state.loading = false;
    state.loadingPlaylistId = null;
    state.lastError = null;
    detachNativeSearch();
    releaseSpotifyNativeFilterSuppression();
    setAdvancedViewState(false);
    restoreNativeTracklist();
    stopMutationWatcher();
    clearResultsUi();
    clearSyntaxHelp();
    return;
  }

  const changed = playlistId !== state.playlistId;
  if (changed) {
    state.query = '';
    state.queryErrors = [];
    state.filtered = [];
    state.playlistId = playlistId;
    state.nativeSearchMissingSince = 0;
    setAdvancedViewState(false);
    renderSmartSearch(config);
    await loadCurrentPlaylist(false, 'route-change');
  }
  hookNativeSearch();
  maintainMutationWatcher();
  renderSmartSearch(config);
}

export function applyConfiguration() {
  const config = loadConfig();
  if (!config.enabled) {
    detachNativeSearch();
    stopMutationWatcher();
    if (state.playbackSession) state.playbackSession.active = false;
    clearAdvancedQuery();
    restoreNativeTracklist();
    setAdvancedViewState(false);
    renderSmartSearch(config);
    return;
  }
  hookNativeSearch();
  maintainMutationWatcher();
  maintainSmartSearchView();
  renderSmartSearch(config);
  const playlistId = playlistIdFromLocation();
  if (playlistId && (!state.tracks.length || state.playlistId !== playlistId)) void loadCurrentPlaylist(false, 'config-change');
}

export function maybeRefreshExpiredCache() {
  if (!state.playlistId || !state.query) return;
  const cached = state.cache.get(state.playlistId);
  if (cached && Date.now() - cached.loadedAt > CACHE_TTL_MS) void loadCurrentPlaylist(true, 'cache-ttl');
}

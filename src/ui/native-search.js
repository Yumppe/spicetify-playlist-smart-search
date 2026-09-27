import { state } from '../state.js';
import { loadConfig } from '../config.js';
import { emit } from '../events.js';
import { smartSyntaxUsed } from '../search/parser.js';
import { nativeSearchCandidates } from './dom.js';
import { suppressSpotifyNativeFilter, releaseSpotifyNativeFilterSuppression } from '../spotify/search-control.js';

let nativeBlankConfirmTimer = null;

function cancelBlankConfirmation() {
  if (nativeBlankConfirmTimer !== null) {
    clearTimeout(nativeBlankConfirmTimer);
    nativeBlankConfirmTimer = null;
  }
}

function confirmSearchWasCleared(candidate) {
  if (nativeBlankConfirmTimer !== null) return;
  const queryAtSchedule = state.query;
  nativeBlankConfirmTimer = setTimeout(() => {
    nativeBlankConfirmTimer = null;
    if (!queryAtSchedule || state.query !== queryAtSchedule) return;
    if (!candidate?.isConnected || String(candidate.value || '').trim()) return;
    state.smartRefreshPending = false;
    releaseSpotifyNativeFilterSuppression();
    emit('advanced-cleared');
  }, 120);
}

function interceptAdvancedInput(input, event, value) {
  try {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  } catch {}
  suppressSpotifyNativeFilter(input, value);
  emit('advanced-input', { input, value, event: event ?? null });
}

function syncNativeSearchValue(candidate, event = null) {
  const value = candidate.value || '';
  if (value.trim()) cancelBlankConfirmation();

  if (smartSyntaxUsed(value)) {
    if (event || value !== state.query) interceptAdvancedInput(candidate, event, value);
    return;
  }

  if (state.query) {
    if (!event && !value.trim()) {
      confirmSearchWasCleared(candidate);
      return;
    }
    cancelBlankConfirmation();
    state.smartRefreshPending = false;
    releaseSpotifyNativeFilterSuppression();
    emit('advanced-cleared');
  }
}

export function detachNativeSearch() {
  cancelBlankConfirmation();
  if (state.nativeSearchInput && state.nativeSearchListener) {
    state.nativeSearchInput.removeEventListener('input', state.nativeSearchListener, true);
    state.nativeSearchInput.removeEventListener('change', state.nativeSearchListener, true);
  }
  state.nativeSearchInput?.classList.remove('smart-search-native-active');
  state.nativeSearchInput = null;
  state.nativeSearchListener = null;
  releaseSpotifyNativeFilterSuppression();
}

export function hookNativeSearch() {
  if (!loadConfig().enabled) { detachNativeSearch(); return; }
  const candidate = nativeSearchCandidates()[0] || null;
  if (!candidate) {
    if (!state.nativeSearchMissingSince) state.nativeSearchMissingSince = Date.now();
    if (state.query && Date.now() - state.nativeSearchMissingSince > 1000) emit('advanced-cleared');
    return;
  }
  state.nativeSearchMissingSince = 0;
  if (candidate === state.nativeSearchInput) {
    syncNativeSearchValue(candidate);
    return;
  }
  detachNativeSearch();
  const listener = (event) => syncNativeSearchValue(candidate, event);
  candidate.addEventListener('input', listener, true);
  candidate.addEventListener('change', listener, true);
  state.nativeSearchInput = candidate;
  state.nativeSearchListener = listener;
  syncNativeSearchValue(candidate);
}

import { MUTATION_DEBOUNCE_MS, MUTATION_REFRESH_COOLDOWN_MS, RESULTS_HOST_ID } from '../constants.js';
import { state } from '../state.js';
import { loadConfig } from '../config.js';
import { emit } from '../events.js';
import { findPlaylistPage, findTracklistContainer } from '../ui/dom.js';
import { recordDiagnostic } from '../diagnostics.js';

let observer = null;
let root = null;
let debounceTimer = null;
let lastRefreshAt = 0;
let suspendedUntil = 0;

export function suspendMutationWatcher(ms = 300) {
  suspendedUntil = Math.max(suspendedUntil, Date.now() + ms);
}

function elementForMutation(mutation) {
  const target = mutation.target;
  if (!target) return null;
  return target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
}

function isOwnMutation(mutation) {
  const target = elementForMutation(mutation);
  return Boolean(target?.closest?.(`#${RESULTS_HOST_ID}`));
}

function isInsideNativeTracklist(mutation) {
  const target = elementForMutation(mutation);
  const tracklist = findTracklistContainer();
  return Boolean(target && tracklist && (target === tracklist || tracklist.contains(target)));
}

function mentionsPlaylistCount(mutation) {
  const target = elementForMutation(mutation);
  const candidates = [
    target?.textContent || '',
    ...[...(mutation.addedNodes ?? [])].map((node) => node.textContent || ''),
    ...[...(mutation.removedNodes ?? [])].map((node) => node.textContent || ''),
  ];
  return candidates.some((text) => /\b\d[\d,.\s]*\s+(?:songs?|tracks?)\b/i.test(String(text).slice(0, 300)));
}

function scheduleCandidateRefresh(reason = 'dom-mutation') {
  if (!loadConfig().livePlaylistRefresh || Date.now() < suspendedUntil) return;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const now = Date.now();
    if (now - lastRefreshAt < MUTATION_REFRESH_COOLDOWN_MS) return;
    lastRefreshAt = now;
    recordDiagnostic('playlist-mutation-candidate', reason);
    emit('playlist-mutation-candidate', { reason });
  }, MUTATION_DEBOUNCE_MS);
}

export function maintainMutationWatcher() {
  if (!loadConfig().livePlaylistRefresh || !state.playlistId) {
    stopMutationWatcher();
    return;
  }

  // Watch the playlist page, not virtualized rows that remount while scrolling.
  const nextRoot = findPlaylistPage();
  if (!nextRoot) return;
  if (observer && root === nextRoot) return;
  stopMutationWatcher();
  root = nextRoot;
  observer = new MutationObserver((mutations) => {
    if (Date.now() < suspendedUntil) return;
    for (const mutation of mutations) {
      if (isOwnMutation(mutation)) continue;
      if (isInsideNativeTracklist(mutation)) continue;
      if (mentionsPlaylistCount(mutation)) {
        scheduleCandidateRefresh('playlist-count-change');
        return;
      }
    }
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true });
}

export function stopMutationWatcher() {
  try { observer?.disconnect(); } catch {}
  observer = null;
  root = null;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = null;
}

import { state } from '../state.js';

export function findPlaylistPage() {
  return document.querySelector('[data-testid="playlist-page"]') || document.querySelector('main');
}

export function findTracklistContainer() {
  const page = findPlaylistPage();
  if (!page) return null;
  return page.querySelector('[data-testid="playlist-tracklist"]')
    || page.querySelector('.main-trackList-trackList')
    || page.querySelector('[role="grid"]');
}

export function playlistIdFromLocation() {
  const path = state.S?.Platform?.History?.location?.pathname || location.pathname || '';
  const match = path.match(/\/playlist\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

export function nativeSearchCandidates() {
  const page = findPlaylistPage();
  if (!page) return [];
  return [...page.querySelectorAll('input')].filter((input) => {
    const hint = `${input.getAttribute('placeholder') || ''} ${input.getAttribute('aria-label') || ''}`.toLocaleLowerCase();
    return input.getAttribute('role') === 'searchbox' || hint.includes('playlist') || input.classList.contains('x-filterBox-filterInput');
  });
}

export function restoreNativeTracklist() {
  if (state.hiddenTracklist) {
    try { state.hiddenTracklist.style.display = state.hiddenTracklistDisplay; } catch {}
  }
  state.hiddenTracklist = null;
  state.hiddenTracklistDisplay = '';
}

export function hideNativeTracklist() {
  const tracklist = findTracklistContainer();
  if (!tracklist) return;
  if (state.hiddenTracklist && state.hiddenTracklist !== tracklist) restoreNativeTracklist();
  if (state.hiddenTracklist !== tracklist) {
    state.hiddenTracklist = tracklist;
    state.hiddenTracklistDisplay = tracklist.style.display || '';
  }
  // CSS handles later remounts; hide the current node immediately too.
  if (tracklist.style.display !== 'none') tracklist.style.display = 'none';
}

export function setAdvancedViewState(active) {
  state.nativeSearchInput?.classList.toggle('smart-search-native-active', active);
  const page = findPlaylistPage();
  page?.classList.toggle('smart-search-advanced-view', active);
  if (!active) restoreNativeTracklist();
}

// Compatibility alias for older internal imports.
export const setNativeSmartState = setAdvancedViewState;

import { state } from '../state.js';
import { findPlaylistPage } from '../ui/dom.js';

const SORT_KEYS = {
  custom: ['custom order', 'playlist order'],
  title: ['title', 'track title'],
  artist: ['artist'],
  album: ['album'],
  added: ['recently added', 'date added', 'added'],
  duration: ['duration', 'time'],
};

function normalizeLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function keyFromLabel(value) {
  const text = normalizeLabel(value);
  if (!text) return null;
  for (const [key, aliases] of Object.entries(SORT_KEYS)) {
    if (aliases.some((alias) => text === alias || text.includes(alias))) return key;
  }
  return null;
}

function directionFromAria(value) {
  const text = normalizeLabel(value);
  if (text === 'descending') return 'desc';
  if (text === 'ascending') return 'asc';
  return null;
}

function readAriaSort(page) {
  for (const element of page?.querySelectorAll?.('[aria-sort]') ?? []) {
    const direction = directionFromAria(element.getAttribute('aria-sort'));
    if (!direction) continue;
    const key = keyFromLabel(`${element.textContent || ''} ${element.getAttribute('aria-label') || ''}`);
    if (key) return { key, direction, source: 'aria-sort' };
  }
  return null;
}

function sortControlCandidates(page) {
  if (!page) return [];
  return [...page.querySelectorAll('button[role="combobox"], [role="combobox"], button[aria-label*="sort" i], button[title*="sort" i], [class*="sort" i] button')].filter((element) => {
    const text = `${element.textContent || ''} ${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`;
    return Boolean(keyFromLabel(text));
  });
}

function readSortControl(page) {
  for (const element of sortControlCandidates(page)) {
    const combined = `${element.textContent || ''} ${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`;
    const key = keyFromLabel(combined);
    if (!key) continue;
    const lower = normalizeLabel(combined);
    let direction = null;
    if (/descending|newest|latest/.test(lower)) direction = 'desc';
    else if (/ascending|oldest/.test(lower)) direction = 'asc';
    // Spotify shows Recently added newest-first by default.
    if (!direction) direction = key === 'added' ? 'desc' : 'asc';
    return { key, direction, source: 'sort-control' };
  }
  return null;
}

export function readSpotifySortState() {
  const page = findPlaylistPage();
  return readAriaSort(page) ?? readSortControl(page) ?? { key: 'custom', direction: 'asc', source: 'default' };
}

export function sortSignature(sortState = readSpotifySortState()) {
  return `${sortState?.key || 'custom'}:${sortState?.direction || 'asc'}`;
}

function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true });
}

function selectorForKey(key) {
  if (key === 'title') return (track) => track.titleNorm ?? track.title ?? '';
  if (key === 'artist') return (track) => track.artistNorm?.[0] ?? track.artists?.[0] ?? '';
  if (key === 'album') return (track) => track.albumNorm ?? track.album ?? '';
  if (key === 'added') return (track) => Date.parse(track.addedAt || '') || 0;
  if (key === 'duration') return (track) => Number(track.duration || 0);
  return (track) => Number(track.playlistIndex || 0);
}

export function sortTracks(tracks, sortState = state.sortState) {
  const source = [...(tracks ?? [])];
  const key = sortState?.key || 'custom';
  const direction = sortState?.direction === 'desc' ? -1 : 1;
  const selector = selectorForKey(key);
  return source.map((track, index) => ({ track, index, value: selector(track) }))
    .sort((a, b) => {
      const cmp = typeof a.value === 'number' && typeof b.value === 'number'
        ? a.value - b.value
        : compareText(a.value, b.value);
      return cmp ? cmp * direction : a.index - b.index;
    })
    .map((entry) => entry.track);
}

export function syncSpotifySortState() {
  const next = readSpotifySortState();
  const signature = sortSignature(next);
  if (signature === state.sortSignature) return false;
  state.sortState = next;
  state.sortSignature = signature;
  return true;
}

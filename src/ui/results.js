import { RESULTS_HOST_ID, RENDER_CHUNK } from '../constants.js';
import { state } from '../state.js';
import { loadConfig, updateConfig } from '../config.js';
import { findPlaylistPage, findTracklistContainer, hideNativeTracklist, restoreNativeTracklist, setAdvancedViewState } from './dom.js';
import { playFilteredRespectingSpotify } from '../spotify/playback.js';

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatAddedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try { return new Intl.DateTimeFormat(navigator.language || 'en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date); }
  catch { return date.toLocaleDateString(); }
}

function queryUsesYear(node) {
  if (!node || typeof node !== 'object') return false;
  if (['year-eq', 'year-gt', 'year-gte', 'year-lt', 'year-lte', 'year-range'].includes(node.kind)) return true;
  if (node.kind === 'not') return queryUsesYear(node.child);
  if (node.kind === 'and' || node.kind === 'or') return node.children?.some(queryUsesYear) ?? false;
  return false;
}

function playIconSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.4v13.2c0 .72.79 1.15 1.4.76l10.15-6.6a.9.9 0 0 0 0-1.52L9.4 4.64A.9.9 0 0 0 8 5.4Z"></path></svg>`;
}

export function ensureHost() {
  let host = document.getElementById(RESULTS_HOST_ID);
  const tracklist = findTracklistContainer();
  const page = findPlaylistPage();
  const anchorParent = tracklist?.parentElement || page;
  if (!anchorParent) return null;
  if (!host) {
    host = document.createElement('div');
    host.id = RESULTS_HOST_ID;
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Smart Search results');
    host.innerHTML = `<div class="ss1-shell">
      <div class="ss1-toolbar" hidden>
        <div class="ss1-summary"><span class="ss1-smart-dot" aria-hidden="true"></span><strong>Smart Search</strong><span class="ss1-count"></span><span class="ss1-progress"></span></div>
        <div class="ss1-actions"><button class="ss1-button primary" data-action="play" type="button">▶ Play results</button><button class="ss1-button icon" data-action="collapse" type="button" aria-label="Collapse results">⌃</button></div>
      </div>
      <div class="ss1-body" hidden>
        <div class="ss1-column-header"><span>#</span><span>Title</span><span class="ss1-album-column">Album</span><span class="ss1-date-column">Date added</span><span style="text-align:right">Time</span></div>
        <div class="ss1-status" role="status" aria-live="polite" hidden></div>
        <div class="ss1-results"></div><div class="ss1-sentinel"></div>
      </div>
      <div class="ss1-collapsed-note" hidden>Results are collapsed. Playback still uses the complete filtered result set.</div>
    </div>`;
    anchorParent.insertBefore(host, tracklist || null);
    state.resultsHost = host;
    state.resultsList = host.querySelector('.ss1-results');
    state.resultsSentinel = host.querySelector('.ss1-sentinel');
    host.querySelector('[data-action="play"]')?.addEventListener('click', () => void playFilteredRespectingSpotify());
    host.querySelector('[data-action="collapse"]')?.addEventListener('click', () => {
      const config = updateConfig({ resultsCollapsed: !loadConfig().resultsCollapsed });
      renderSmartSearch(config);
    });
    try { state.resultsObserver?.disconnect(); } catch {}
    state.resultsObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) appendResultChunk();
    }, { root: null, rootMargin: '500px 0px' });
    if (state.resultsSentinel) state.resultsObserver.observe(state.resultsSentinel);
  } else if (host.parentElement !== anchorParent || (tracklist && host.nextSibling !== tracklist)) {
    anchorParent.insertBefore(host, tracklist || null);
  }
  state.resultsHost = host;
  state.resultsList = host.querySelector('.ss1-results');
  state.resultsSentinel = host.querySelector('.ss1-sentinel');
  return host;
}

function createResultRow(track, resultIndex) {
  const row = document.createElement('div');
  row.className = 'ss1-row';
  row.tabIndex = 0;
  row.dataset.uri = track.uri;
  row.dataset.resultIndex = String(resultIndex);
  row.setAttribute('aria-label', `${track.title} — ${track.artists.join(', ')}`);
  const number = document.createElement('div'); number.className = 'ss1-row-number';
  const index = document.createElement('span'); index.className = 'ss1-row-index'; index.textContent = String(resultIndex + 1);
  const play = document.createElement('button');
  play.className = 'ss1-row-play';
  play.type = 'button';
  play.innerHTML = playIconSvg();
  play.setAttribute('aria-label', `Play ${track.title}`);
  play.addEventListener('click', (event) => { event.stopPropagation(); void playFilteredRespectingSpotify(resultIndex); });
  number.append(index, play);
  const titleCell = document.createElement('div'); titleCell.className = 'ss1-title-cell';
  if (track.image) {
    const image = document.createElement('img'); image.className = 'ss1-cover'; image.src = track.image; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; titleCell.appendChild(image);
  } else {
    const placeholder = document.createElement('div'); placeholder.className = 'ss1-cover-placeholder'; titleCell.appendChild(placeholder);
  }
  const stack = document.createElement('div'); stack.className = 'ss1-title-stack';
  const title = document.createElement('div'); title.className = 'ss1-title'; title.textContent = track.title;
  const artists = document.createElement('div'); artists.className = 'ss1-artists'; artists.textContent = track.artists.join(', '); stack.append(title, artists); titleCell.appendChild(stack);
  const album = document.createElement('div'); album.className = 'ss1-album ss1-album-column'; album.textContent = track.album;
  const added = document.createElement('div'); added.className = 'ss1-added ss1-date-column'; added.textContent = formatAddedDate(track.addedAt);
  const duration = document.createElement('div'); duration.className = 'ss1-duration'; duration.textContent = formatDuration(track.duration);
  row.append(number, titleCell, album, added, duration);
  row.addEventListener('dblclick', () => void playFilteredRespectingSpotify(resultIndex));
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void playFilteredRespectingSpotify(resultIndex);
    }
  });
  return row;
}

function appendResultChunk() {
  const list = state.resultsList;
  if (!list || loadConfig().resultsCollapsed || !state.query || state.queryErrors.length) return;
  const end = Math.min(state.filtered.length, state.renderedCount + RENDER_CHUNK);
  if (end <= state.renderedCount) return;
  const fragment = document.createDocumentFragment();
  for (let index = state.renderedCount; index < end; index += 1) fragment.appendChild(createResultRow(state.filtered[index], index));
  list.appendChild(fragment);
  state.renderedCount = end;
  updatePlayingRowStyles();
}

function resetRenderedResults() {
  state.renderedCount = 0;
  state.resultsList?.replaceChildren();
  appendResultChunk();
}

export function updatePlayingRowStyles() {
  const currentUri = state.S?.Player?.data?.item?.uri || '';
  state.resultsHost?.querySelectorAll('.ss1-row').forEach((row) => row.classList.toggle('is-playing', Boolean(currentUri && row.dataset.uri === currentUri)));
}

export function updatePlaybackUi() {
  const host = state.resultsHost;
  if (!host) return;
  const play = host.querySelector('[data-action="play"]');
  const progress = host.querySelector('.ss1-progress');
  const disabled = state.playbackBusy || !state.filtered.length || state.queryErrors.length > 0;
  if (play) { play.disabled = disabled; play.textContent = state.playbackBusy ? 'Starting…' : '▶ Play results'; }
  if (progress) {
    const session = state.playbackSession;
    const belongs = session?.active && session.query === state.query && session.sequence.length > 0 && state.filtered.length > 0;
    progress.textContent = belongs && session.currentIndex >= 0 ? `· Playing ${Math.min(session.currentIndex + 1, session.sequence.length)}/${session.sequence.length}` : '';
  }
  updatePlayingRowStyles();
}

export function maintainSmartSearchView() {
  const config = loadConfig();
  const active = config.enabled && Boolean(state.query.trim());
  if (!active) return;
  setAdvancedViewState(true);
  hideNativeTracklist();
  ensureHost();
}

export function renderSmartSearch(config = loadConfig()) {
  const active = config.enabled && Boolean(state.query.trim());
  const host = ensureHost();
  if (!host) return;
  const toolbar = host.querySelector('.ss1-toolbar');
  const body = host.querySelector('.ss1-body');
  const status = host.querySelector('.ss1-status');
  const count = host.querySelector('.ss1-count');
  const collapsedNote = host.querySelector('.ss1-collapsed-note');
  const collapse = host.querySelector('[data-action="collapse"]');
  host.hidden = !active;
  if (!active) {
    if (toolbar) toolbar.hidden = true;
    if (body) body.hidden = true;
    if (collapsedNote) collapsedNote.hidden = true;
    setAdvancedViewState(false);
    restoreNativeTracklist();
    return;
  }

  setAdvancedViewState(true);
  hideNativeTracklist();
  if (toolbar) toolbar.hidden = false;
  if (count) count.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? '' : 's'}`;
  if (collapse) {
    collapse.textContent = config.resultsCollapsed ? '⌄' : '⌃';
    collapse.title = config.resultsCollapsed ? 'Expand results' : 'Collapse results';
    collapse.setAttribute('aria-label', collapse.title);
  }
  if (config.resultsCollapsed) {
    if (body) body.hidden = true;
    if (collapsedNote) collapsedNote.hidden = false;
  } else {
    if (body) body.hidden = false;
    if (collapsedNote) collapsedNote.hidden = true;
    if (status) { status.hidden = true; status.className = 'ss1-status'; }
    if (state.queryErrors.length) {
      if (status) { status.hidden = false; status.className = 'ss1-status query-error'; status.textContent = state.queryErrors.join(' '); }
    } else if (state.yearMetadataLoading) {
      if (status) { status.hidden = false; status.textContent = 'Loading release years…'; }
    } else if (state.loading) {
      if (status) { status.hidden = false; status.textContent = 'Loading playlist…'; }
    } else if (state.lastError) {
      if (status) { status.hidden = false; status.className = 'ss1-status error'; status.textContent = state.lastError; }
    } else if (!state.filtered.length && queryUsesYear(state.queryAst) && state.lastYearMetadataSummary?.failed) {
      if (status) { status.hidden = false; status.className = 'ss1-status query-error'; status.textContent = 'Could not load release-year metadata for this playlist.'; }
    } else if (!state.filtered.length) {
      if (status) { status.hidden = false; status.textContent = 'No matching tracks'; }
    }
    resetRenderedResults();
  }
  updatePlaybackUi();
}

export function clearResultsUi() {
  document.getElementById(RESULTS_HOST_ID)?.remove();
  state.resultsHost = null; state.resultsList = null; state.resultsSentinel = null;
  try { state.resultsObserver?.disconnect(); } catch {}
  state.resultsObserver = null; state.renderedCount = 0;
  setAdvancedViewState(false);
}

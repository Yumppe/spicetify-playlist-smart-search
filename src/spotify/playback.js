import {
  PLAYBACK_BUFFER_TARGET,
  PLAYBACK_BUFFER_LOW_WATER,
  PLAYBACK_REFILL_CHUNK,
} from '../constants.js';
import { state } from '../state.js';
import { detectCapabilities } from './capabilities.js';
import { findPlaylistPage, findTracklistContainer } from '../ui/dom.js';
import { consoleError, consoleWarn, sleep } from '../utils.js';
import { emit } from '../events.js';
import { recordDiagnostic } from '../diagnostics.js';
import {
  buildNativeQueuePayload,
  contextTailForSession,
  manualQueueTracks,
  playbackPlan,
  queueItemUri,
  randomStartIndex,
} from './queue-model.js';

function playerQueueController() {
  return state.S?.Platform?.PlayerAPI?._queue ?? null;
}

function currentManualQueueTracks() {
  const controller = playerQueueController();
  return manualQueueTracks(controller?._queueState, controller?._queue);
}

function rememberManualQueue(session, tracks = currentManualQueueTracks()) {
  if (!session) return tracks;
  if (!(session.manualQueueUris instanceof Set)) session.manualQueueUris = new Set();
  for (const track of tracks) if (track?.uri) session.manualQueueUris.add(track.uri);
  return tracks;
}

function spotifyRepeatMode() {
  try {
    if (typeof state.S?.Player?.getRepeat === 'function') return Number(state.S.Player.getRepeat()) || 0;
  } catch {}
  const fallback = state.S?.Player?.data?.repeat ?? state.S?.Platform?.PlayerAPI?._state?.repeat;
  return Number(fallback) || 0;
}

export function spotifyShuffleState() {
  try {
    if (typeof state.S?.Player?.getShuffle === 'function') return Boolean(state.S.Player.getShuffle());
  } catch {}
  return Boolean(state.S?.Player?.data?.shuffle);
}

function queueContextUpcomingCount() {
  const nextUp = playerQueueController()?._queueState?.nextUp;
  return Array.isArray(nextUp) ? nextUp.filter((item) => !item?.provider || item.provider === 'context').length : null;
}

function nativeContextUpcomingUris() {
  const nextUp = playerQueueController()?._queueState?.nextUp;
  if (!Array.isArray(nextUp)) return [];
  const result = [];
  for (const item of nextUp) {
    if (item?.provider && item.provider !== 'context') continue;
    const uri = queueItemUri(item);
    if (uri) result.push(uri);
  }
  return result;
}

function waitForQueueUpdate(timeoutMs = 360) {
  const playerApi = state.S?.Platform?.PlayerAPI;
  let events = null;
  try { events = playerApi?.getEvents?.() ?? playerApi?._events ?? null; } catch {}
  if (!events?.addListener) return sleep(55);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      try { events.removeListener?.('queue_update', finish); } catch {}
      resolve();
    };
    try { events.addListener('queue_update', finish, { once: true }); }
    catch { resolve(); return; }
    timer = setTimeout(finish, timeoutMs);
  });
}

async function waitForCurrentUri(uri, timeoutMs = 700) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (state.S?.Player?.data?.item?.uri === uri) return true;
    await sleep(20);
  }
  return state.S?.Player?.data?.item?.uri === uri;
}

function expectedContextTail(session) {
  return contextTailForSession(session, spotifyRepeatMode());
}

function nativeQueueDiverged(session) {
  if (session.method !== 'native-setQueue' || session.currentIndex < 0) return false;
  const expected = expectedContextTail(session).slice(0, 8).map((track) => track.uri);
  const actual = nativeContextUpcomingUris().slice(0, 8);
  if (!expected.length) return actual.length > 0;
  if (!actual.length) return true;
  const comparable = Math.min(expected.length, actual.length);
  for (let index = 0; index < comparable; index += 1) {
    if (expected[index] !== actual[index]) return true;
  }
  if (spotifyRepeatMode() !== 1 && expected.length < 8 && actual.length > expected.length) return true;
  return false;
}

async function setNativeUpcoming({ leadTrack = null, contextTracks = [], session = null, manualTracks = null } = {}) {
  const controller = playerQueueController();
  const queueCore = controller?._queue;
  const client = controller?._client;
  if (!client?.setQueue || !queueCore) throw new Error('Native Spotify queue API is unavailable');
  const preservedManual = manualTracks === null ? rememberManualQueue(session) : rememberManualQueue(session, manualTracks);
  const queueUpdate = waitForQueueUpdate();
  await client.setQueue(buildNativeQueuePayload({
    queueCore,
    leadTrack,
    manualTracks: preservedManual,
    contextTracks,
  }));
  await queueUpdate;
  return preservedManual;
}

async function reseedNativeQueueTail(session, { allowEmpty = false } = {}) {
  if (!session?.active) return;
  const remaining = expectedContextTail(session);
  if (!remaining.length && spotifyRepeatMode() !== 1 && !allowEmpty) return;
  await setNativeUpcoming({ contextTracks: remaining, session });
  session.refillCount += 1;
  session.lastNativeReseedAt = Date.now();
  recordDiagnostic('queue-reseed', `context=${remaining.length}; manual=${currentManualQueueTracks().length}; repeat=${spotifyRepeatMode()}; shuffle=${session.shuffle}`);
}

async function advancePlayerToLead(selected) {
  // Prefer PlayerAPI here; Player.next() can trigger a false playback toast on some builds.
  const skip = state.S?.Platform?.PlayerAPI?.skipToNext;
  if (typeof skip === 'function') {
    await skip.call(state.S.Platform.PlayerAPI);
    await waitForCurrentUri(selected.uri);
    return 'setQueue-skipToNext';
  }
  const next = state.S?.Player?.next;
  if (typeof next === 'function') {
    const result = next.call(state.S.Player);
    if (result && typeof result.then === 'function') await result;
    await waitForCurrentUri(selected.uri);
    return 'setQueue-next';
  }
  throw new Error('Spotify next-track API is unavailable');
}

async function playWithNativeSetQueue(plan, shuffle) {
  const { cycle, startIndex, selected } = plan;
  if (!selected) return;

  const preservedManual = currentManualQueueTracks();
  const session = {
    active: true,
    method: 'native-setQueue',
    sequence: cycle,
    currentIndex: startIndex,
    nextEnqueueIndex: cycle.length,
    startedAt: Date.now(),
    shuffle,
    query: state.query,
    lastCurrentUri: selected.uri,
    lastContextUri: selected.uri,
    refillCount: 0,
    manualQueueUris: new Set(preservedManual.map((track) => track.uri)),
  };
  state.playbackSession = session;

  // Seed the selected result into the queue and advance instead of starting with playUri.
  await setNativeUpcoming({
    leadTrack: selected,
    contextTracks: expectedContextTail(session),
    session,
    manualTracks: [],
  });
  session.lastStartMethod = await advancePlayerToLead(selected);

  // Put manually queued songs back ahead of the automatic Smart Search tail.
  await setNativeUpcoming({
    contextTracks: expectedContextTail(session),
    session,
    manualTracks: preservedManual,
  });

  for (const delay of [80, 260]) {
    await sleep(delay);
    if (!session.active) break;
    if (nativeQueueDiverged(session)) await reseedNativeQueueTail(session, { allowEmpty: true });
  }
}

async function enqueueTracks(tracks) {
  if (!tracks.length) return;
  const contexts = tracks.map((track) => ({ uri: track.uri, uid: track.uid || undefined }));
  const c = detectCapabilities();
  if (c.silentAddToQueue) {
    await state.S.addToQueue(contexts);
    return;
  }
  if (c.platformAddToQueue) {
    await state.S.Platform.PlayerAPI.addToQueue(contexts);
    return;
  }
  throw new Error('No compatible queue API is available');
}

async function refillSlidingQueue(force = false) {
  const session = state.playbackSession;
  if (!session?.active || session.method !== 'sliding-addToQueue') return;
  const repeatMode = spotifyRepeatMode();
  const remainingBuffered = Math.max(0, session.nextEnqueueIndex - session.currentIndex - 1);
  if (!force && remainingBuffered > PLAYBACK_BUFFER_LOW_WATER) return;

  let slice = [];
  if (session.nextEnqueueIndex < session.sequence.length) {
    const desiredEnd = Math.min(
      session.sequence.length,
      Math.max(session.nextEnqueueIndex + PLAYBACK_REFILL_CHUNK, session.currentIndex + 1 + PLAYBACK_BUFFER_TARGET),
    );
    slice = session.sequence.slice(session.nextEnqueueIndex, desiredEnd);
    session.nextEnqueueIndex = desiredEnd;
  } else if (repeatMode === 1 && session.sequence.length) {
    slice = session.sequence.slice(0, Math.min(session.sequence.length, PLAYBACK_BUFFER_TARGET));
    session.nextEnqueueIndex = slice.length;
  }
  if (!slice.length) return;
  await enqueueTracks(slice);
  session.refillCount += 1;
}

async function playWithSlidingQueue(plan, shuffle) {
  const { cycle, startIndex, selected } = plan;
  if (!selected) return;
  const manualTracks = currentManualQueueTracks();
  if (typeof state.S?.Player?.playUri !== 'function') throw new Error('No compatible playback API is available');
  await state.S.Player.playUri(selected.uri);
  if (typeof state.S?.Platform?.PlayerAPI?.clearQueue === 'function') {
    try { await state.S.Platform.PlayerAPI.clearQueue(); } catch {}
  }
  const session = {
    active: true,
    method: 'sliding-addToQueue',
    sequence: cycle,
    currentIndex: startIndex,
    nextEnqueueIndex: startIndex + 1,
    startedAt: Date.now(),
    shuffle,
    query: state.query,
    lastCurrentUri: selected.uri,
    lastContextUri: selected.uri,
    refillCount: 0,
    manualQueueUris: new Set(manualTracks.map((track) => track.uri)),
  };
  state.playbackSession = session;
  if (manualTracks.length) await enqueueTracks(manualTracks);
  await refillSlidingQueue(true);
}

function findSessionIndexForUri(session, uri, preferNextDuplicate = false) {
  let start = Math.max(0, session.currentIndex);
  if (preferNextDuplicate && session.lastCurrentUri === uri && start < session.sequence.length - 1) start += 1;
  for (let index = start; index < session.sequence.length; index += 1) if (session.sequence[index]?.uri === uri) return index;
  for (let index = 0; index < start; index += 1) if (session.sequence[index]?.uri === uri) return index;
  return -1;
}

function currentTrackMarkedQueued() {
  const metadata = state.S?.Player?.data?.item?.metadata ?? state.S?.Player?.data?.contextTrack?.metadata;
  return metadata?.is_queued === 'true' || metadata?.is_queued === true;
}

function currentTrackIsManualQueue(session, uri, resolvedIndex) {
  if (currentTrackMarkedQueued()) return true;
  return resolvedIndex < 0 && session?.manualQueueUris instanceof Set && session.manualQueueUris.has(uri);
}

function currentResultIndexInFiltered(uri) {
  if (!uri) return -1;
  return state.filtered.findIndex((track) => track.uri === uri);
}

function rebuildSessionForShuffle(session, shuffle, currentUri, currentIsManual) {
  if (!state.filtered.length) return false;
  const anchorUri = currentIsManual ? session.lastContextUri : currentUri;
  const sourceIndex = currentResultIndexInFiltered(anchorUri);
  if (sourceIndex < 0) return false;
  const plan = playbackPlan(state.filtered, sourceIndex, shuffle);
  session.sequence = plan.cycle;
  session.currentIndex = plan.startIndex;
  session.nextEnqueueIndex = plan.cycle.length;
  session.shuffle = shuffle;
  session.lastCurrentUri = currentUri;
  session.lastContextUri = anchorUri;
  recordDiagnostic('shuffle-sync', shuffle ? 'enabled; new randomized Smart Search order' : 'disabled; restored visible Smart Search order');
  return true;
}

export async function maintainPlaybackSession(reason = 'poll') {
  const session = state.playbackSession;
  if (!session?.active || state.playbackMaintenanceInFlight) return;
  state.playbackMaintenanceInFlight = true;
  try {
    rememberManualQueue(session);
    const currentUri = state.S?.Player?.data?.item?.uri || null;
    if (!currentUri) return;
    let index = findSessionIndexForUri(session, currentUri, reason === 'songchange');
    const manualCurrent = currentTrackIsManualQueue(session, currentUri, index);

    const shuffleNow = spotifyShuffleState();
    if (shuffleNow !== Boolean(session.shuffle)) {
      if (rebuildSessionForShuffle(session, shuffleNow, currentUri, manualCurrent)) {
        index = findSessionIndexForUri(session, manualCurrent ? session.lastContextUri : currentUri, false);
        if (session.method === 'native-setQueue') await reseedNativeQueueTail(session, { allowEmpty: true });
        else if (session.method === 'sliding-addToQueue') {
          session.nextEnqueueIndex = Math.max(0, session.currentIndex + 1);
          await refillSlidingQueue(true);
        }
      }
    }

    if (manualCurrent) {
      session.lastCurrentUri = currentUri;
      emit('playback-update');
      return;
    }

    if (index < 0) {
      if (Date.now() - session.startedAt > 4000) session.active = false;
      return;
    }
    session.currentIndex = index;
    session.lastCurrentUri = currentUri;
    session.lastContextUri = currentUri;

    if (session.method === 'sliding-addToQueue') await refillSlidingQueue(false);
    if (session.method === 'native-setQueue') {
      const repeatMode = spotifyRepeatMode();
      const logicalRemaining = Math.max(0, session.sequence.length - index - 1);
      const upcoming = queueContextUpcomingCount();
      const cooldownDone = !session.lastNativeReseedAt || Date.now() - session.lastNativeReseedAt > 500;
      const repeatNeedsWrap = repeatMode === 1 && logicalRemaining <= PLAYBACK_BUFFER_LOW_WATER;
      const needsRefill = upcoming !== null
        && logicalRemaining > PLAYBACK_BUFFER_LOW_WATER
        && upcoming <= PLAYBACK_BUFFER_LOW_WATER;
      const contextWasRegenerated = nativeQueueDiverged(session);
      if (cooldownDone && (repeatNeedsWrap || needsRefill || contextWasRegenerated)) {
        await reseedNativeQueueTail(session, { allowEmpty: contextWasRegenerated });
      }
    }
    emit('playback-update');
  } catch (error) {
    consoleWarn('Playback maintenance failed.', error);
  } finally {
    state.playbackMaintenanceInFlight = false;
  }
}

async function startFilteredPlayback(startIndex, shuffle) {
  const plan = playbackPlan(state.filtered, startIndex, shuffle);
  if (!plan.selected) return;
  if (detectCapabilities().nativeSetQueue) {
    try {
      await playWithNativeSetQueue(plan, shuffle);
      return;
    } catch (error) {
      consoleWarn('Native Smart Search playback bridge failed; using compatibility queue.', error);
    }
  }
  await playWithSlidingQueue(plan, shuffle);
}

export async function playFilteredRespectingSpotify(startIndex = null) {
  if (!state.filtered.length || state.playbackBusy) return;
  const shuffle = spotifyShuffleState();
  const explicitIndex = Number.isInteger(startIndex);
  const resolvedStart = explicitIndex ? startIndex : (shuffle ? randomStartIndex(state.filtered.length) : 0);
  state.playbackBusy = true;
  emit('playback-update');
  try {
    await startFilteredPlayback(resolvedStart, shuffle);
    recordDiagnostic('playback-start', `${state.playbackSession?.method ?? 'unknown'}; result=${resolvedStart + 1}; shuffle=${shuffle}; manual-preserved`);
  } catch (error) {
    state.playbackSession = null;
    consoleError('Could not start Smart Search playback.', error);
    state.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
  } finally {
    state.playbackBusy = false;
    emit('playback-update');
  }
}

// Kept for tests and older internal callers. The UI follows Spotify's shuffle state.
export async function playFiltered(startIndex = 0, shuffle = false) {
  if (!state.filtered.length || state.playbackBusy) return;
  state.playbackBusy = true;
  emit('playback-update');
  try {
    await startFilteredPlayback(startIndex, shuffle);
  } catch (error) {
    state.playbackSession = null;
    consoleError('Could not start filtered playback.', error);
    state.S?.showNotification?.(`Smart Search could not start playback: ${error?.message || error}`, true);
  } finally {
    state.playbackBusy = false;
    emit('playback-update');
  }
}

export function isSmartSearchPlaybackControl(target) {
  return Boolean(target?.closest?.('#smart-search-results-root'));
}

function isPlaylistMainPlayButton(target) {
  // The capture listener sees row clicks first, so ignore Smart Search's own controls.
  if (isSmartSearchPlaybackControl(target)) return false;
  const button = target.closest?.('button');
  if (!button || findTracklistContainer()?.contains(button)) return false;
  const page = findPlaylistPage();
  if (!page?.contains(button)) return false;
  const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();
  const cls = button.className?.toString?.().toLowerCase?.() || '';
  return /(^|\s)play(\s|$)|play playlist/.test(label) || /playbutton/.test(cls);
}

function interceptPlaylistPlay(event) {
  if (!state.query || state.queryErrors.length) return;
  const target = event.target;
  if (!target?.closest || event.type !== 'click' || !isPlaylistMainPlayButton(target)) return;
  try {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  } catch {}
  void playFilteredRespectingSpotify();
}

export function installPlaybackBridge() {
  document.addEventListener('click', interceptPlaylistPlay, true);
}

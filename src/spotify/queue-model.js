export function queueItemUri(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.uri === 'string' && item.uri.startsWith('spotify:track:')) return item.uri;
  if (typeof item.contextTrack?.uri === 'string' && item.contextTrack.uri.startsWith('spotify:track:')) return item.contextTrack.uri;
  return null;
}

function queueItemUid(item) {
  if (!item || typeof item !== 'object') return '';
  return String(item.uid ?? item.contextTrack?.uid ?? '');
}

function queueItemMetadata(item) {
  return item?.contextTrack?.metadata ?? item?.metadata ?? {};
}

export function isExplicitQueueItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.provider === 'queue') return true;
  const marker = queueItemMetadata(item)?.is_queued;
  return marker === true || marker === 'true';
}

export function makeQueueItem(track, queued = false) {
  const uri = typeof track === 'string' ? track : track?.uri;
  const uid = typeof track === 'string' ? '' : String(track?.uid ?? '');
  return {
    contextTrack: {
      uri,
      uid,
      metadata: { is_queued: queued ? 'true' : 'false' },
    },
    removed: [],
    blocked: [],
    provider: queued ? 'queue' : 'context',
  };
}

export function makeDelimiterQueueItem() {
  return {
    contextTrack: { uri: 'spotify:delimiter', uid: '', metadata: { is_queued: 'false' } },
    removed: [],
    blocked: [],
    provider: 'context',
  };
}

function pushUniqueTrack(target, seen, item) {
  const uri = queueItemUri(item);
  if (!uri) return;
  const uid = queueItemUid(item);
  const key = `${uri}|${uid}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({ uri, uid });
}

export function manualQueueTracks(queueState, queueCore = null) {
  const tracks = [];
  const seen = new Set();

  // Prefer explicit queue markers when available; `queued` can briefly include context tracks.
  const lowLevel = Array.isArray(queueCore?.nextTracks) ? queueCore.nextTracks : [];
  for (const item of lowLevel) {
    if (isExplicitQueueItem(item)) pushUniqueTrack(tracks, seen, item);
  }

  const queued = Array.isArray(queueState?.queued) ? queueState.queued : [];
  const hasClassification = queued.some((item) => item?.provider != null || queueItemMetadata(item)?.is_queued != null);
  for (const item of queued) {
    // Older clients only expose the `queued` bucket, so membership is the fallback signal.
    if (hasClassification && !isExplicitQueueItem(item)) continue;
    pushUniqueTrack(tracks, seen, item);
  }
  return tracks;
}

export function buildNativeQueuePayload({
  queueCore,
  leadTrack = null,
  manualTracks = [],
  contextTracks = [],
} = {}) {
  const nextTracks = [];
  if (leadTrack?.uri) nextTracks.push(makeQueueItem(leadTrack, false));
  for (const track of manualTracks) {
    if (track?.uri) nextTracks.push(makeQueueItem(track, true));
  }
  for (const track of contextTracks) {
    if (track?.uri) nextTracks.push(makeQueueItem(track, false));
  }
  nextTracks.push(makeDelimiterQueueItem());
  return {
    nextTracks,
    prevTracks: Array.isArray(queueCore?.prevTracks) ? queueCore.prevTracks : [],
    queueRevision: queueCore?.queueRevision,
  };
}

export function fisherYates(input, random = Math.random) {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function playbackPlan(tracks, startIndex = 0, shuffle = false, random = Math.random) {
  const source = [...(tracks ?? [])];
  if (!source.length) return { cycle: [], startIndex: 0, selected: null };
  const safeIndex = Math.max(0, Math.min(Number(startIndex) || 0, source.length - 1));
  const selected = source[safeIndex];
  if (!shuffle) return { cycle: source, startIndex: safeIndex, selected };
  const remaining = source.filter((_, index) => index !== safeIndex);
  const cycle = [selected, ...fisherYates(remaining, random)];
  return { cycle, startIndex: 0, selected };
}

export function randomStartIndex(length, random = Math.random) {
  const safeLength = Math.max(0, Number(length) || 0);
  if (!safeLength) return 0;
  return Math.min(safeLength - 1, Math.floor(random() * safeLength));
}

export function contextTailForSession(session, repeatMode = 0, _minimum = 0) {
  const cycle = Array.isArray(session?.sequence) ? session.sequence : [];
  if (!cycle.length) return [];
  const index = Math.max(-1, Math.min(Number(session?.currentIndex ?? -1), cycle.length - 1));
  const tail = cycle.slice(index + 1);
  if (repeatMode === 1) tail.push(...cycle);
  return tail;
}

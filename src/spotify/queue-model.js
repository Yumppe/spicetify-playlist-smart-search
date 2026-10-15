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

function toTrack(item) {
  const uri = queueItemUri(item);
  return uri ? { uri, uid: queueItemUid(item) } : null;
}

export function manualQueueTracks(queueState, queueCore = null) {
  // The same queue may appear in both of Spotify's internal representations.
  // Prefer the classified queueState (which preserves duplicates), or fall
  // back to core.nextTracks; never deduplicate intentional repeated tracks.
  const queued = Array.isArray(queueState?.queued) ? queueState.queued : [];
  const classified = queued.some((item) => item?.provider != null || queueItemMetadata(item)?.is_queued != null);
  const explicit = queued.filter((item) => !classified || isExplicitQueueItem(item));
  const core = Array.isArray(queueCore?.nextTracks) ? queueCore.nextTracks : [];
  // An explicitly empty queued array means the user cleared their queue.
  // Do not recover stale entries from core.nextTracks in that case.
  const selected = Array.isArray(queueState?.queued) ? explicit : core.filter(isExplicitQueueItem);
  return selected.map(toTrack).filter(Boolean);
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

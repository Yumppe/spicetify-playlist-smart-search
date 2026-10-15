/**
 * Classify changes to Spotify's upcoming *context* queue. The queue is an
 * ordered multiset: removing one occurrence of a song must not remove all of
 * its appearances. No URI-only Set can represent that correctly.
 */
export function inspectQueueChange(expected, actual) {
  const oldUris = [...(expected ?? [])];
  const liveUris = [...(actual ?? [])];
  if (oldUris.length === liveUris.length && oldUris.every((uri, i) => uri === liveUris[i])) {
    return { kind: 'same', removed: [], uris: liveUris };
  }
  const retainedPositions = [];
  let cursor = 0;
  for (let i = 0; i < oldUris.length && cursor < liveUris.length; i += 1) {
    if (oldUris[i] === liveUris[cursor]) { retainedPositions.push(i); cursor++; }
  }
  if (cursor === liveUris.length && liveUris.length < oldUris.length) {
    const kept = new Set(retainedPositions);
    return { kind: 'removed', removed: oldUris.filter((_, i) => !kept.has(i)), uris: liveUris };
  }
  const counts = (values) => {
    const result = new Map();
    for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
    return result;
  };
  const previous = counts(oldUris);
  const next = counts(liveUris);
  if (previous.size === next.size && [...previous].every(([uri, count]) => next.get(uri) === count)) {
    return { kind: 'reordered', removed: [], uris: liveUris };
  }
  return { kind: 'other-change', removed: [], uris: liveUris };
}

/** Resolve each URI occurrence to its own track occurrence when possible. */
export function tracksForQueueUris(tracks, uris) {
  const pool = new Map();
  for (const track of tracks ?? []) {
    if (!pool.has(track.uri)) pool.set(track.uri, []);
    pool.get(track.uri).push(track);
  }
  const result = [];
  for (const uri of uris ?? []) {
    const available = pool.get(uri);
    if (!available?.length) return null; // Unknown track/context: don't assume ownership.
    result.push(available.shift());
  }
  return result;
}

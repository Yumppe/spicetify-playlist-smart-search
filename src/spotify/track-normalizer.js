import { firstDefined, normalizeText } from '../utils.js';

function directTrackCandidate(item) {
  if (!item || typeof item !== 'object') return null;
  const wrappers = [item.track, item.itemV2, item.item, item.content, item.entity, item];
  for (const wrapper of wrappers) {
    if (!wrapper || typeof wrapper !== 'object') continue;
    const wrapperUri = wrapper.uri || wrapper._uri || wrapper.trackUri || wrapper.track_uri
      || wrapper.entity?.uri || wrapper.data?.uri || wrapper.data?._uri || wrapper.data?.entity?.uri;
    const data = wrapper.data && typeof wrapper.data === 'object' ? wrapper.data : wrapper;
    const dataUri = data.uri || data._uri || data.trackUri || data.track_uri || data.entity?.uri;
    const uri = wrapperUri || dataUri;
    if (typeof uri === 'string' && uri.startsWith('spotify:track:')) return { data, uri, wrapper };
  }
  const directData = item.data;
  if (directData && typeof directData === 'object') {
    const uri = directData.uri || directData._uri || directData.trackUri || directData.track_uri || directData.entity?.uri;
    if (typeof uri === 'string' && uri.startsWith('spotify:track:')) return { data: directData, uri, wrapper: item };
  }
  return null;
}

function extractArtistNames(candidate) {
  const buckets = [
    candidate.artists,
    candidate.artists?.items,
    candidate.artist,
    candidate.artist?.items,
    candidate.performers,
    candidate.entity?.artists,
    candidate.entity?.artist,
  ];
  const names = [];
  for (const bucket of buckets) {
    const items = Array.isArray(bucket) ? bucket : bucket ? [bucket] : [];
    for (const artist of items) {
      if (typeof artist === 'string') names.push(artist);
      else if (artist && typeof artist === 'object') {
        const name = artist.name ?? artist.profile?.name ?? artist.data?.profile?.name ?? artist.data?.name;
        if (name) names.push(String(name));
      }
    }
    if (names.length) break;
  }
  if (!names.length && candidate.metadata?.artist_name) names.push(String(candidate.metadata.artist_name));
  return [...new Set(names.filter(Boolean))];
}

export function releaseYearFromValue(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1000 && value <= 9999) return Math.trunc(value);
  if (typeof value === 'object') {
    for (const key of ['year', 'isoString', 'date', 'releaseDate', 'release_date', 'value']) {
      const nested = releaseYearFromValue(value?.[key]);
      if (nested) return nested;
    }
    return null;
  }
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function sanitizeImageUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const spotifyImage = text.match(/^spotify:image:([A-Za-z0-9]+)$/i);
  if (spotifyImage) return `https://i.scdn.co/image/${spotifyImage[1]}`;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function trackUriFromUnknown(item) {
  return directTrackCandidate(item)?.uri ?? null;
}

export function normalizeTrackItem(item, playlistIndex) {
  const candidate = directTrackCandidate(item);
  if (!candidate) return null;
  const c = candidate.data;
  const title = String(firstDefined(c, [['name'], ['title'], ['entity', 'name'], ['entity', 'title'], ['metadata', 'title']]) ?? 'Unknown track');
  const artists = extractArtistNames(c);
  const albumObject = firstDefined(c, [['albumOfTrack'], ['album'], ['release'], ['entity', 'album']]);
  const album = typeof albumObject === 'string'
    ? albumObject
    : String(albumObject?.name ?? albumObject?.title ?? c.metadata?.album_title ?? '');
  const releaseValue = firstDefined(c, [
    ['albumOfTrack', 'date', 'isoString'],
    ['albumOfTrack', 'date', 'year'],
    ['albumOfTrack', 'date'],
    ['albumOfTrack', 'releaseDate', 'isoString'],
    ['albumOfTrack', 'releaseDate'],
    ['albumOfTrack', 'release_date'],
    ['album', 'release_date'],
    ['album', 'releaseDate'],
    ['album', 'date'],
    ['release_date'],
    ['releaseDate'],
    ['date'],
    ['metadata', 'album_release_date'],
    ['metadata', 'release_date'],
    ['metadata', 'releaseDate'],
    ['metadata', 'album_release_year'],
    ['metadata', 'release_year'],
  ]);
  const yearCandidate = releaseYearFromValue(releaseValue)
    ?? releaseYearFromValue(albumObject?.date)
    ?? releaseYearFromValue(albumObject?.release_date)
    ?? releaseYearFromValue(albumObject?.releaseDate);
  const durationCandidate = Number(firstDefined(c, [
    ['duration', 'totalMilliseconds'],
    ['duration', 'milliseconds'],
    ['trackDuration', 'totalMilliseconds'],
    ['duration_ms'],
    ['durationMs'],
    ['metadata', 'duration'],
  ]) ?? 0);
  const image = sanitizeImageUrl(firstDefined(c, [
    ['albumOfTrack', 'coverArt', 'sources', 0, 'url'],
    ['album', 'images', 0, 'url'],
    ['album', 'coverArt', 'sources', 0, 'url'],
    ['metadata', 'image_url'],
    ['metadata', 'image_large_url'],
  ]));
  const addedAt = String(firstDefined(item, [
    ['addedAt'], ['added_at'], ['itemV2', 'addedAt'], ['track', 'addedAt'], ['metadata', 'added_at'],
  ]) ?? '');
  const uid = item?.uid ?? item?.itemV2?.uid ?? item?.item?.uid ?? candidate.wrapper?.uid ?? c.uid ?? null;
  const isPlayable = firstDefined(item, [['isPlayable'], ['track', 'isPlayable'], ['itemV2', 'isPlayable']]) !== false;
  const titleNorm = normalizeText(title);
  const artistNorm = artists.map(normalizeText);
  const albumNorm = normalizeText(album);
  return {
    uri: candidate.uri,
    uid: uid ? String(uid) : null,
    title,
    artists,
    album,
    year: Number.isFinite(yearCandidate) ? yearCandidate : null,
    duration: Number.isFinite(durationCandidate) ? durationCandidate : 0,
    image,
    addedAt,
    playlistIndex,
    isPlayable,
    titleNorm,
    artistNorm,
    albumNorm,
    searchText: [titleNorm, albumNorm, ...artistNorm].join(' '),
    rawItem: item,
  };
}

export function findBestTrackArray(root) {
  const direct = firstDefined(root, [
    ['data', 'playlistV2', 'content', 'items'],
    ['playlistV2', 'content', 'items'],
    ['data', 'playlist', 'content', 'items'],
  ]);
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(direct?.items)) return direct.items;

  let best = null;
  const seen = new WeakSet();
  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 14 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length) {
        let score = 0;
        for (const item of node.slice(0, 10)) if (directTrackCandidate(item)) score += 1;
        if (score && (!best || score > best.score || (score === best.score && node.length > best.array.length))) best = { score, array: node };
      }
      for (const item of node.slice(0, 12)) walk(item, depth + 1);
    } else {
      for (const value of Object.values(node)) walk(value, depth + 1);
    }
  }
  walk(root, 0);
  return best?.array ?? [];
}

export function normalizeItems(items, baseIndex = 0) {
  const tracks = [];
  for (let index = 0; index < items.length; index += 1) {
    try {
      const track = normalizeTrackItem(items[index], baseIndex + index);
      if (track?.isPlayable) tracks.push(track);
    } catch {}
  }
  return tracks;
}

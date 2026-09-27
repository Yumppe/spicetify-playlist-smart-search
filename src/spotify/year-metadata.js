import { state } from '../state.js';
import { recordDiagnostic } from '../diagnostics.js';
import { releaseYearFromValue } from './track-normalizer.js';

const yearCache = new Map();

function trackIdFromUri(uri) {
  const match = String(uri ?? '').match(/^spotify:track:([A-Za-z0-9]+)$/);
  return match ? match[1] : null;
}

function astHasYearNode(node) {
  if (!node || typeof node !== 'object') return false;
  if (['year-eq', 'year-gt', 'year-gte', 'year-lt', 'year-lte', 'year-range'].includes(node.kind)) return true;
  if (node.kind === 'not') return astHasYearNode(node.child);
  if (node.kind === 'and' || node.kind === 'or') return node.children?.some(astHasYearNode) ?? false;
  return false;
}

export function queryNeedsYearMetadata(parseResultOrAst) {
  return astHasYearNode(parseResultOrAst?.ast ?? parseResultOrAst);
}

function chunks(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

function applyCachedYears(tracks) {
  let updated = 0;
  for (const track of tracks) {
    if (track.year != null) continue;
    const id = trackIdFromUri(track.uri);
    if (!id || !yearCache.has(id)) continue;
    const year = yearCache.get(id);
    if (year != null) {
      track.year = year;
      updated += 1;
    }
  }
  return updated;
}

export async function ensureReleaseYears(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  let updated = applyCachedYears(list);
  const missing = [];
  const seen = new Set();
  for (const track of list) {
    if (track.year != null) continue;
    const id = trackIdFromUri(track.uri);
    if (!id || seen.has(id) || yearCache.has(id)) continue;
    seen.add(id);
    missing.push(id);
  }

  if (!missing.length) {
    return { requested: 0, updated, unresolved: list.filter((track) => track.year == null).length, failed: false };
  }

  const get = state.S?.CosmosAsync?.get;
  if (typeof get !== 'function') {
    recordDiagnostic('release-year-lookup', 'CosmosAsync unavailable');
    return { requested: missing.length, updated, unresolved: list.filter((track) => track.year == null).length, failed: true };
  }

  let failed = false;
  for (const batch of chunks(missing, 50)) {
    try {
      const response = await get.call(state.S.CosmosAsync, `https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`);
      const returned = Array.isArray(response?.tracks) ? response.tracks : [];
      const returnedIds = new Set();
      for (const item of returned) {
        const id = String(item?.id ?? '').trim();
        if (!id) continue;
        returnedIds.add(id);
        const year = releaseYearFromValue(item?.album?.release_date)
          ?? releaseYearFromValue(item?.album?.releaseDate)
          ?? releaseYearFromValue(item?.release_date);
        yearCache.set(id, year ?? null);
      }
      for (const id of batch) if (!returnedIds.has(id)) yearCache.set(id, null);
    } catch (error) {
      failed = true;
      recordDiagnostic('release-year-lookup-error', error?.message || String(error));
      break;
    }
  }

  updated += applyCachedYears(list);
  const unresolved = list.filter((track) => track.year == null).length;
  recordDiagnostic('release-year-lookup', `${missing.length} requested; ${updated} updated; ${unresolved} unresolved${failed ? '; failed' : ''}`);
  return { requested: missing.length, updated, unresolved, failed };
}

export function clearReleaseYearCache() {
  yearCache.clear();
}

import { CACHE_TTL_MS, PAGE_SIZE } from '../constants.js';
import { state } from '../state.js';
import { firstDefined, sleep, consoleWarn } from '../utils.js';
import { detectCapabilities, playlistGraphQLDefinitions } from './capabilities.js';
import { findBestTrackArray, normalizeItems } from './track-normalizer.js';
import { recordDiagnostic } from '../diagnostics.js';

function namedGraphQLType(typeNode) {
  let node = typeNode;
  while (node?.type) node = node.type;
  return node?.name?.value ?? '';
}

function graphQLVariableNames(definition) {
  const operation = definition?.definitions?.find((item) => item?.kind === 'OperationDefinition');
  return (operation?.variableDefinitions ?? []).map((variable) => ({
    name: variable?.variable?.name?.value,
    type: namedGraphQLType(variable?.type),
    required: variable?.type?.kind === 'NonNullType',
    defaultValue: variable?.defaultValue?.value,
  })).filter((item) => item.name);
}

function buildGraphQLVariables(definition, playlistUri, playlistId, offset, limit) {
  const specs = graphQLVariableNames(definition);
  const context = state.S?.GraphQL?.Context ?? {};
  const variables = {};
  for (const spec of specs) {
    const lower = spec.name.toLowerCase();
    if (['uri', 'playlisturi', 'playlist_uri'].includes(lower)) variables[spec.name] = playlistUri;
    else if (['playlistid', 'playlist_id'].includes(lower)) variables[spec.name] = playlistId;
    else if (lower === 'offset') variables[spec.name] = offset;
    else if (lower === 'limit') variables[spec.name] = limit;
    else if (lower === 'enablewatchfeedentrypoint') variables[spec.name] = false;
    else if (lower === 'locale') variables[spec.name] = context.locale || state.S?.Platform?.Session?.locale || 'en';
    else if (lower === 'market') variables[spec.name] = context.market || state.S?.Platform?.Session?.country || 'from_token';
    else if (spec.defaultValue !== undefined) {
      if (spec.type === 'Boolean') variables[spec.name] = spec.defaultValue === true || spec.defaultValue === 'true';
      else if (spec.type === 'Int' || spec.type === 'Float') variables[spec.name] = Number(spec.defaultValue);
      else variables[spec.name] = spec.defaultValue;
    } else if (spec.required && spec.type === 'Boolean') variables[spec.name] = false;
  }
  return variables;
}

async function fetchPlaylistViaPlatformAPI(playlistId) {
  const api = state.S?.Platform?.PlaylistAPI;
  if (typeof api?.getContents !== 'function') throw new Error('PlaylistAPI.getContents is unavailable');
  const attempts = [`spotify:playlist:${playlistId}`, playlistId];
  const errors = [];
  for (const argument of attempts) {
    try {
      const response = await api.getContents.call(api, argument);
      const items = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : findBestTrackArray(response);
      const tracks = normalizeItems(items, 0);
      if (tracks.length || items.length === 0) return tracks;
      errors.push(`${String(argument).startsWith('spotify:') ? 'URI' : 'ID'} returned no playable tracks`);
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  throw new Error(`PlaylistAPI failed: ${errors.join(' | ')}`);
}

async function waitForPlaylistGraphQLDefinitions(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = detectCapabilities();
    if (c.graphqlRequest && c.graphqlPlaylistDefinition) return true;
    await sleep(100);
  }
  return false;
}

async function fetchPlaylistViaGraphQL(playlistId) {
  await waitForPlaylistGraphQLDefinitions();
  if (typeof state.S?.GraphQL?.Request !== 'function') throw new Error('GraphQL.Request is unavailable');
  const definitions = playlistGraphQLDefinitions(state.S);
  if (!definitions.length) throw new Error('No compatible playlist GraphQL definition is available');

  const playlistUri = `spotify:playlist:${playlistId}`;
  const failures = [];
  for (const [name, definition] of definitions) {
    try {
      const tracks = [];
      let offset = 0;
      for (let page = 0; page < 200; page += 1) {
        const variables = buildGraphQLVariables(definition, playlistUri, playlistId, offset, PAGE_SIZE);
        const response = await state.S.GraphQL.Request(definition, variables, { persistCache: true });
        const items = findBestTrackArray(response);
        tracks.push(...normalizeItems(items, offset));
        const total = Number(firstDefined(response, [
          ['data', 'playlistV2', 'content', 'totalCount'],
          ['playlistV2', 'content', 'totalCount'],
        ]) ?? NaN);
        if (!items.length || items.length < PAGE_SIZE || (Number.isFinite(total) && offset + items.length >= total)) break;
        offset += items.length;
      }
      if (tracks.length) return tracks;
      failures.push(`${name}: no playable tracks`);
    } catch (error) {
      failures.push(`${name}: ${error?.message || error}`);
    }
  }
  throw new Error(`GraphQL fallback failed: ${failures.join(' | ')}`);
}

export function fingerprintTracks(tracks) {
  // Cheap fingerprint for add/remove/reorder checks.
  let hash = 2166136261;
  for (const track of tracks) {
    const token = `${track.uid ?? ''}|${track.uri}|${track.playlistIndex};`;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${tracks.length}:${(hash >>> 0).toString(16)}`;
}

export function invalidatePlaylistCache(playlistId = state.playlistId, reason = 'unspecified') {
  if (!playlistId) return;
  state.cache.delete(playlistId);
  recordDiagnostic('cache-invalidated', reason);
}

export function clearPlaylistCache(reason = 'clear-all') {
  state.cache.clear();
  recordDiagnostic('cache-cleared', reason);
}

export async function getPlaylistTracks(playlistId, { force = false } = {}) {
  const cached = state.cache.get(playlistId);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return { tracks: cached.tracks, source: cached.source, fingerprint: cached.fingerprint, changed: false, cached: true };
  }

  let tracks = [];
  let source = '';
  let platformError = null;
  const c = detectCapabilities();

  if (c.playlistGetContents) {
    try {
      tracks = await fetchPlaylistViaPlatformAPI(playlistId);
      source = 'PlaylistAPI';
    } catch (error) {
      platformError = error;
      consoleWarn('PlaylistAPI source failed; considering GraphQL fallback.', error);
    }
  }

  if (!source && c.graphqlRequest) {
    try {
      tracks = await fetchPlaylistViaGraphQL(playlistId);
      source = 'GraphQL';
    } catch (graphQLError) {
      const platformMessage = platformError?.message || String(platformError || 'unavailable');
      throw new Error(`Could not load playlist. PlaylistAPI: ${platformMessage}. GraphQL: ${graphQLError?.message || graphQLError}`);
    }
  }

  if (!source) {
    throw new Error('No compatible playlist data source is available in this Spotify/Spicetify build.');
  }

  const fingerprint = fingerprintTracks(tracks);
  const previous = cached?.fingerprint ?? state.lastPlaylistFingerprint;
  const changed = Boolean(previous && previous !== fingerprint);
  const entry = { tracks, loadedAt: Date.now(), source, fingerprint };
  state.cache.set(playlistId, entry);
  state.lastPlaylistFingerprint = fingerprint;
  recordDiagnostic('playlist-loaded', `${source}; ${tracks.length} tracks${changed ? '; changed' : ''}`);
  return { tracks, source, fingerprint, changed, cached: false };
}

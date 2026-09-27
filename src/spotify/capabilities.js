import { state } from '../state.js';

const PLAYLIST_DEFINITION_NAMES = [
  'FetchPlaylistContents',
  'fetchPlaylist',
  'fetchPlaylistContents',
  'fetchPlaylistContentsWithGatedEntityRelations',
];

function operationName(definition) {
  try {
    return definition?.definitions?.find((item) => item?.kind === 'OperationDefinition')?.name?.value ?? '';
  } catch {
    return '';
  }
}

export function graphQLDefinitionPools(S = state.S ?? globalThis.Spicetify) {
  const graphQL = S?.GraphQL;
  return [graphQL?.Definitions, graphQL?.QueryDefinitions]
    .filter((pool, index, all) => pool && typeof pool === 'object' && all.indexOf(pool) === index);
}

export function playlistGraphQLDefinitions(S = state.S ?? globalThis.Spicetify) {
  const found = [];
  const seen = new Set();
  for (const pool of graphQLDefinitionPools(S)) {
    for (const name of PLAYLIST_DEFINITION_NAMES) {
      const definition = pool?.[name];
      if (definition && !seen.has(definition)) {
        seen.add(definition);
        found.push([name, definition]);
      }
    }
    for (const [key, definition] of Object.entries(pool)) {
      if (!definition || seen.has(definition)) continue;
      const op = operationName(definition);
      if ((/playlist/i.test(key) && /contents/i.test(key)) || (/playlist/i.test(op) && /contents/i.test(op))) {
        seen.add(definition);
        found.push([op || key, definition]);
      }
    }
  }
  return found;
}

export function detectCapabilities() {
  const S = state.S ?? globalThis.Spicetify;
  const playerApi = S?.Platform?.PlayerAPI;
  const queueController = playerApi?._queue;
  const queueCore = queueController?._queue;
  const queueClient = queueController?._client;
  const pools = graphQLDefinitionPools(S);
  const playlistDefinitions = playlistGraphQLDefinitions(S);

  return {
    spicetify: Boolean(S),
    platform: Boolean(S?.Platform),
    player: Boolean(S?.Player),
    playerEvents: typeof S?.Player?.addEventListener === 'function',
    playerPlayUri: typeof S?.Player?.playUri === 'function',
    playerNext: typeof S?.Player?.next === 'function',
    history: Boolean(S?.Platform?.History),
    historyListen: typeof S?.Platform?.History?.listen === 'function',
    playlistApi: Boolean(S?.Platform?.PlaylistAPI),
    playlistGetContents: typeof S?.Platform?.PlaylistAPI?.getContents === 'function',
    cosmosAsync: typeof S?.CosmosAsync?.get === 'function',
    graphql: Boolean(S?.GraphQL),
    graphqlRequest: typeof S?.GraphQL?.Request === 'function',
    graphqlDefinitions: pools.length > 0,
    graphqlPlaylistDefinition: playlistDefinitions.length > 0,
    graphqlPlaylistDefinitionNames: playlistDefinitions.map(([name]) => name),
    localStorage: Boolean(S?.LocalStorage?.get && S?.LocalStorage?.set),
    popupModal: typeof S?.PopupModal?.display === 'function',
    menuItem: typeof S?.Menu?.Item === 'function',
    silentAddToQueue: typeof S?.addToQueue === 'function',
    platformAddToQueue: typeof playerApi?.addToQueue === 'function',
    clearQueue: typeof playerApi?.clearQueue === 'function',
    nativeSetQueue: Boolean(queueClient?.setQueue && queueCore),
    queueState: Boolean(queueController?._queueState),
  };
}

export function capabilityRows() {
  const c = detectCapabilities();
  const graphQLReady = c.graphqlRequest && c.graphqlPlaylistDefinition;
  const graphQLStatus = graphQLReady ? 'Ready' : c.graphqlRequest ? 'Not exposed' : 'Unavailable';
  const graphQLTone = graphQLReady ? 'ok' : c.playlistGetContents ? 'neutral' : 'warn';

  return [
    { name: 'Playlist API', status: c.playlistGetContents ? 'Available' : 'Unavailable', tone: c.playlistGetContents ? 'ok' : 'warn', note: 'Primary playlist source' },
    { name: 'GraphQL fallback', status: graphQLStatus, tone: graphQLTone, note: graphQLReady ? `Fallback definition: ${c.graphqlPlaylistDefinitionNames[0]}` : c.playlistGetContents ? 'Only needed if Playlist API fails' : 'No compatible playlist definition detected' },
    { name: 'Release-year lookup', status: c.cosmosAsync ? 'Available' : 'Unavailable', tone: c.cosmosAsync ? 'ok' : 'warn', note: 'Used when year metadata is missing' },
    { name: 'Smart Search result view', status: 'Built in', tone: 'ok', note: 'Advanced searches no longer patch Spotify React rows' },
    { name: 'Queue-first playback', status: c.nativeSetQueue && c.playerNext ? 'Available' : 'Fallback', tone: c.nativeSetQueue && c.playerNext ? 'ok' : 'warn', note: 'Starts filtered tracks with setQueue + Next to avoid false playback toasts' },
    { name: 'Private setQueue bridge', status: c.nativeSetQueue ? 'Available' : 'Unavailable', tone: c.nativeSetQueue ? 'ok' : 'neutral', note: 'Preferred filtered automatic queue' },
    { name: 'Manual queue readback', status: c.queueState ? 'Available' : 'Unavailable', tone: c.queueState ? 'ok' : 'warn', note: 'Preserves songs explicitly added by the user' },
    { name: 'Silent queue API', status: c.silentAddToQueue ? 'Available' : 'Unavailable', tone: c.silentAddToQueue ? 'ok' : 'neutral', note: 'Compatibility queue fallback' },
    { name: 'Platform queue API', status: c.platformAddToQueue ? 'Available' : 'Unavailable', tone: c.platformAddToQueue ? 'ok' : 'neutral', note: 'Secondary queue fallback' },
    { name: 'Settings modal', status: c.popupModal ? 'Available' : 'Unavailable', tone: c.popupModal ? 'ok' : 'warn', note: 'Settings and update UI' },
    { name: 'Settings menu', status: c.menuItem ? 'Available' : 'Unavailable', tone: c.menuItem ? 'ok' : 'neutral', note: 'Profile-menu entry' },
  ];
}

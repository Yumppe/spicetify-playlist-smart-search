import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { maintainPlaybackSession, playFilteredRespectingSpotify } from '../src/spotify/playback.js';

function track(id) {
  return { uri: `spotify:track:${id}`, uid: id, title: id, artists: [], artistNorm: [], titleNorm: id, albumNorm: '', searchText: id, playlistIndex: Number(id) || 0 };
}

function stateItem(item) {
  return {
    uri: item.contextTrack.uri,
    contextTrack: item.contextTrack,
    provider: item.provider,
  };
}

function installQueueState(queueState, calls) {
  const queueCore = { prevTracks: [], nextTracks: [], queueRevision: 'r1' };
  return {
    _queue: queueCore,
    _queueState: queueState,
    _client: {
      async setQueue(payload) {
        calls.push(payload);
        queueCore.nextTracks = payload.nextTracks;
        const items = payload.nextTracks.filter((item) => item.contextTrack.uri !== 'spotify:delimiter');
        queueState.queued = items.filter((item) => item.provider === 'queue').map(stateItem);
        queueState.nextUp = items.filter((item) => item.provider === 'context').map(stateItem);
      },
    },
  };
}

function installPlayer({ queueState, calls, shuffle = false, repeat = 0 }) {
  const Player = {
    data: { item: { uri: 'spotify:track:old-current', metadata: { is_queued: 'false' } } },
    getShuffle: () => shuffle,
    getRepeat: () => repeat,
    next() {
      const next = queueState.nextUp.shift();
      if (next) Player.data.item = { uri: next.uri, metadata: next.contextTrack?.metadata ?? { is_queued: 'false' } };
    },
    async playUri() {
      throw new Error('playUri should not be used by the native queue path');
    },
  };
  const PlayerAPI = {
    _queue: installQueueState(queueState, calls),
    async skipToNext() {
      const next = queueState.nextUp.shift();
      if (next) Player.data.item = { uri: next.uri, metadata: next.contextTrack?.metadata ?? { is_queued: 'false' } };
    },
  };
  return { Player, PlayerAPI };
}

test('filtered playback starts clicked result via setQueue+next, preserves manual queue, and follows visible order', async () => {
  const results = ['1', '2', '3', '4', '5'].map(track);
  const manual = { uri: 'spotify:track:manual', uid: 'manual', provider: 'queue', contextTrack: { uri: 'spotify:track:manual', uid: 'manual', metadata: { is_queued: 'true' } } };
  const queueState = { queued: [manual], nextUp: [{ uri: 'spotify:track:old-auto', provider: 'context' }] };
  const calls = [];

  state.filtered = results;
  state.query = '@Mora';
  state.playlistId = 'playlist-id';
  state.playbackBusy = false;
  state.playbackSession = null;

  const { Player, PlayerAPI } = installPlayer({ queueState, calls, shuffle: false });
  state.S = { Player, Platform: { PlayerAPI }, addToQueue: async () => {}, showNotification: () => {} };

  await playFilteredRespectingSpotify(3);

  assert.equal(Player.data.item.uri, 'spotify:track:4');
  assert.ok(calls.length >= 2);
  const finalQueue = calls.at(-1).nextTracks.map((item) => [item.contextTrack.uri, item.provider]);
  assert.deepEqual(finalQueue, [
    ['spotify:track:manual', 'queue'],
    ['spotify:track:5', 'context'],
    ['spotify:delimiter', 'context'],
  ]);
  assert.equal(state.playbackSession.currentIndex, 3);
  assert.equal(state.playbackSession.lastStartMethod, 'setQueue-skipToNext');
});

test('repeat all seeds wraparound order after the clicked result', async () => {
  const results = ['1', '2', '3', '4', '5'].map(track);
  const queueState = { queued: [], nextUp: [] };
  const calls = [];
  state.filtered = results;
  state.query = '@Mora';
  state.playbackBusy = false;
  state.playbackSession = null;

  const { Player, PlayerAPI } = installPlayer({ queueState, calls, shuffle: false, repeat: 1 });
  state.S = { Player, Platform: { PlayerAPI }, addToQueue: async () => {}, showNotification: () => {} };
  await playFilteredRespectingSpotify(3);

  const context = calls.at(-1).nextTracks
    .filter((item) => item.provider === 'context' && item.contextTrack.uri !== 'spotify:delimiter')
    .map((item) => item.contextTrack.uri);
  assert.deepEqual(context.slice(0, 6), [
    'spotify:track:5', 'spotify:track:1', 'spotify:track:2', 'spotify:track:3', 'spotify:track:4', 'spotify:track:5',
  ]);
});

test('changing shuffle while Smart Search is playing rebuilds automatic queue order', async () => {
  const results = ['1', '2', '3', '4', '5', '6'].map(track);
  const queueState = { queued: [], nextUp: [] };
  const calls = [];
  let shuffle = false;

  state.filtered = results;
  state.query = '@Quevedo';
  state.playbackBusy = false;
  state.playbackSession = null;
  const Player = {
    data: { item: { uri: 'spotify:track:2', metadata: { is_queued: 'false' } } },
    getShuffle: () => shuffle,
    getRepeat: () => 0,
    next() {
      const next = queueState.nextUp.shift();
      if (next) Player.data.item = { uri: next.uri, metadata: next.contextTrack?.metadata ?? { is_queued: 'false' } };
    },
  };
  const PlayerAPI = { _queue: installQueueState(queueState, calls) };
  state.S = { Player, Platform: { PlayerAPI }, addToQueue: async () => {}, showNotification: () => {} };

  await playFilteredRespectingSpotify(1);
  assert.deepEqual(queueState.nextUp.map((item) => item.uri), ['spotify:track:3', 'spotify:track:4', 'spotify:track:5', 'spotify:track:6']);

  shuffle = true;
  await maintainPlaybackSession('poll');
  assert.equal(state.playbackSession.shuffle, true);
  const shuffled = queueState.nextUp.map((item) => item.uri);
  assert.equal(shuffled.length, 5);
  assert.equal(new Set(shuffled).size, 5);
  assert.ok(!shuffled.includes('spotify:track:2'));

  shuffle = false;
  await maintainPlaybackSession('poll');
  assert.equal(state.playbackSession.shuffle, false);
  assert.deepEqual(queueState.nextUp.map((item) => item.uri), ['spotify:track:3', 'spotify:track:4', 'spotify:track:5', 'spotify:track:6']);
});

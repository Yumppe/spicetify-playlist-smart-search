import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeQueuePayload,
  contextTailForSession,
  manualQueueTracks,
  playbackPlan,
  randomStartIndex,
} from '../src/spotify/queue-model.js';
import { isSmartSearchPlaybackControl } from '../src/spotify/playback.js';

const tracks = ['1', '2', '3', '4', '5'].map((id) => ({ uri: `spotify:track:${id}`, uid: id }));

test('non-shuffle playback starts at the clicked result without wrapping when repeat is off', () => {
  const plan = playbackPlan(tracks, 3, false);
  assert.equal(plan.startIndex, 3);
  assert.equal(plan.selected.uri, 'spotify:track:4');
  assert.deepEqual(plan.cycle.map((track) => track.uri), tracks.map((track) => track.uri));
  const tail = contextTailForSession({ sequence: plan.cycle, currentIndex: plan.startIndex }, 0, 8);
  assert.deepEqual(tail.map((track) => track.uri), ['spotify:track:5']);
});

test('repeat all wraps from the end back to result 1', () => {
  const plan = playbackPlan(tracks, 3, false);
  const tail = contextTailForSession({ sequence: plan.cycle, currentIndex: plan.startIndex }, 1, 6);
  assert.deepEqual(tail.slice(0, 6).map((track) => track.uri), [
    'spotify:track:5',
    'spotify:track:1',
    'spotify:track:2',
    'spotify:track:3',
    'spotify:track:4',
    'spotify:track:5',
  ]);
});

test('manual Spotify queue entries are preserved ahead of automatic Smart Search context', () => {
  const queueState = {
    queued: [
      { uri: 'spotify:track:manual-a', uid: 'a', provider: 'queue' },
      { contextTrack: { uri: 'spotify:track:manual-b', uid: 'b', metadata: { is_queued: 'true' } }, provider: 'queue' },
    ],
  };
  const manual = manualQueueTracks(queueState);
  const payload = buildNativeQueuePayload({
    queueCore: { prevTracks: [{ uri: 'old' }], queueRevision: 'rev' },
    leadTrack: tracks[3],
    manualTracks: manual,
    contextTracks: [tracks[4]],
  });
  assert.deepEqual(payload.nextTracks.map((item) => item.contextTrack.uri), [
    'spotify:track:4',
    'spotify:track:manual-a',
    'spotify:track:manual-b',
    'spotify:track:5',
    'spotify:delimiter',
  ]);
  assert.equal(payload.nextTracks[1].provider, 'queue');
  assert.equal(payload.nextTracks[1].contextTrack.metadata.is_queued, 'true');
  assert.equal(payload.nextTracks[3].provider, 'context');
});

test('shuffle keeps the clicked song first while including every filtered result once', () => {
  const randomValues = [0.1, 0.9, 0.3, 0.6];
  let offset = 0;
  const plan = playbackPlan(tracks, 2, true, () => randomValues[offset++] ?? 0.5);
  assert.equal(plan.startIndex, 0);
  assert.equal(plan.cycle[0].uri, 'spotify:track:3');
  assert.equal(new Set(plan.cycle.map((track) => track.uri)).size, tracks.length);
});


test('manual queue detection ignores context-classified transitional entries', () => {
  const queueState = { queued: [
    { uri: 'spotify:track:manual', provider: 'queue' },
    { uri: 'spotify:track:old-context', provider: 'context' },
  ] };
  assert.deepEqual(manualQueueTracks(queueState).map((track) => track.uri), ['spotify:track:manual']);
});


test('Play results can choose a random start when Spotify Shuffle is on', () => {
  assert.equal(randomStartIndex(5, () => 0.61), 3);
  assert.equal(randomStartIndex(5, () => 0), 0);
});


test('Smart Search result controls are excluded from the document-level playlist Play interceptor', () => {
  const target = {
    closest(selector) {
      if (selector === '#smart-search-results-root') return { id: 'smart-search-results-root' };
      return null;
    },
  };
  assert.equal(isSmartSearchPlaybackControl(target), true);
  assert.equal(isSmartSearchPlaybackControl({ closest: () => null }), false);
});

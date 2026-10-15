import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectQueueChange, tracksForQueueUris } from '../src/spotify/queue-reconcile.js';
import { manualQueueTracks } from '../src/spotify/queue-model.js';

test('removing the next three songs is a deliberate deletion, not queue drift', () => {
  const change = inspectQueueChange(['a','b','c','d','e'], ['a','e']);
  assert.equal(change.kind, 'removed');
  assert.deepEqual(change.removed, ['b','c','d']);
});
test('the user can remove every queued song', () => {
  assert.equal(inspectQueueChange(['a','b'], []).kind, 'removed');
});
test('duplicate entries can be removed one occurrence at a time', () => {
  const change = inspectQueueChange(['a','a','b'], ['a','b']);
  assert.equal(change.kind, 'removed');
  assert.deepEqual(change.removed, ['a']);
});
test('reordered tracks are recognized', () => {
  assert.equal(inspectQueueChange(['a','b','c'], ['c','a','b']).kind, 'reordered');
});
test('Spotify updates that introduce new tracks are not mistaken for removals', () => {
  assert.equal(inspectQueueChange(['a','b'], ['a','z','b']).kind, 'other-change');
});
test('identity-preserving queue mapping handles repeated songs', () => {
  const one = {uri:'a', uid:'one'}, two = {uri:'a', uid:'two'}, b={uri:'b',uid:'b'};
  assert.deepEqual(tracksForQueueUris([one,two,b], ['a','b','a']), [one,b,two]);
  assert.equal(tracksForQueueUris([one], ['a','a']), null);
});
test('Spotify manual queue duplicates are kept as separate entries', () => {
  const item = {uri:'spotify:track:abc',provider:'queue'};
  assert.equal(manualQueueTracks({queued:[item,item]}).length,2);
});

test('a cleared manual queue does not resurrect stale low-level entries', () => {
  const stale = {uri:'spotify:track:stale',provider:'queue'};
  assert.deepEqual(manualQueueTracks({queued:[]},{nextTracks:[stale]}),[]);
});

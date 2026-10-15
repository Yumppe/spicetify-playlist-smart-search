import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { playFilteredRespectingSpotify, maintainPlaybackSession } from '../src/spotify/playback.js';

function track(id) { return { uri: `spotify:track:${id}`, uid: id }; }
function configure({ repeat = 0, shuffle = false, manual = [] } = {}) {
  const calls = [];
  const core = {nextTracks:[], prevTracks:[], queueRevision:'rev-1'};
  const queueState = { queued: manual.map((t) => ({uri:t.uri,provider:'queue'})), nextUp:[] };
  const player = {
    data: {item: {uri:'spotify:track:old', metadata:{is_queued:'false'}}},
    getShuffle: () => shuffle, getRepeat: () => repeat,
  };
  const queue = {
    _queue:core,_queueState:queueState,
    _client:{ async setQueue(payload) {
      calls.push(payload);
      core.nextTracks = payload.nextTracks;
      queueState.queued = payload.nextTracks.filter((t)=>t.provider === 'queue').map((t)=>({uri:t.contextTrack.uri,provider:'queue'}));
      queueState.nextUp = payload.nextTracks.filter((t)=>t.provider === 'context' && t.contextTrack.uri !== 'spotify:delimiter')
        .map((t)=>({uri:t.contextTrack.uri,provider:'context'}));
    }}
  };
  state.S = {Player:player,Platform:{PlayerAPI:{_queue:queue,async skipToNext() {
    const first = queueState.nextUp.shift();
    if (first) player.data.item = {uri:first.uri,metadata:{is_queued:'false'}};
  }}},showNotification:()=>{}};
  state.filtered = [1,2,3,4,5,6].map(track);
  state.query = '@Quevedo;@Mora';
  state.playbackBusy = false; state.playbackMaintenanceInFlight = false;
  state.playbackSession = null;
  return {calls,core,queueState,player};
}

test('removing the next three songs is preserved across maintenance ticks', async () => {
  const {calls,queueState} = configure();
  await playFilteredRespectingSpotify(0);
  assert.deepEqual(queueState.nextUp.map(x=>x.uri), ['2','3','4','5','6'].map(i=>`spotify:track:${i}`));
  const writes = calls.length;
  queueState.nextUp.splice(0,3); // Spotify's "Remove from queue" operation.
  state.playbackSession.lastQueueWriteAt = Date.now()-3000;
  state.playbackSession.startedAt = Date.now()-3000;
  await maintainPlaybackSession('poll');
  await maintainPlaybackSession('poll');
  assert.equal(calls.length,writes,'must not call setQueue to resurrect deleted tracks');
  assert.deepEqual(queueState.nextUp.map(x=>x.uri), ['spotify:track:5','spotify:track:6']);
  assert.equal(state.playbackSession.userEditedQueue,true);
});

test('removing the entire queue is not repaired even when Repeat All is active', async () => {
  const {calls,queueState} = configure({repeat:1});
  await playFilteredRespectingSpotify(0);
  const writes = calls.length;
  queueState.nextUp = [];
  state.playbackSession.lastQueueWriteAt = Date.now()-3000;
  state.playbackSession.startedAt = Date.now()-3000;
  await maintainPlaybackSession('poll');
  assert.equal(calls.length,writes);
  assert.equal(state.playbackSession.userEditedQueue,true);
});

test('manual duplicates remain separate when filtered playback starts', async () => {
  const {queueState} = configure({manual:[track('manual'),track('manual')]});
  await playFilteredRespectingSpotify(1);
  assert.deepEqual(queueState.queued.map(x=>x.uri), ['spotify:track:manual','spotify:track:manual']);
});

test('compatibility queue does not refill after an explicit queue edit', async () => {
  let added = 0;
  state.playbackMaintenanceInFlight = false;
  state.filtered = [1,2,3,4,5,6].map(track);
  state.S = {
    Player: {data:{item:{uri:'spotify:track:2',metadata:{is_queued:'false'}}},getShuffle:()=>false,getRepeat:()=>0},
    Platform:{PlayerAPI:{}}, addToQueue:async () => {added++;},
  };
  state.playbackSession = {
    active:true, method:'sliding-addToQueue', sequence:state.filtered,
    currentIndex:0, nextEnqueueIndex:2, shuffle:false,
    lastCurrentUri:'spotify:track:1',manualQueueUris:new Set(),
    startedAt:Date.now()-5000, userEditedQueue:true,
  };
  await maintainPlaybackSession('poll');
  assert.equal(added,0,'explicitly edited compatibility queue must not refill');
});

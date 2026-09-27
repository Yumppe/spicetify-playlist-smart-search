import test from 'node:test';
import assert from 'node:assert/strict';
import { sortTracks } from '../src/spotify/sort-bridge.js';

const tracks = [
  { titleNorm: 'zeta', artistNorm: ['beta'], albumNorm: 'gamma', addedAt: '2026-01-01', duration: 200, playlistIndex: 0 },
  { titleNorm: 'alpha', artistNorm: ['gamma'], albumNorm: 'beta', addedAt: '2026-03-01', duration: 100, playlistIndex: 1 },
  { titleNorm: 'beta', artistNorm: ['alpha'], albumNorm: 'alpha', addedAt: '2025-12-01', duration: 300, playlistIndex: 2 },
];

test('Spotify sort bridge mirrors title and artist sorting', () => {
  assert.deepEqual(sortTracks(tracks, { key: 'title', direction: 'asc' }).map((x) => x.titleNorm), ['alpha', 'beta', 'zeta']);
  assert.deepEqual(sortTracks(tracks, { key: 'artist', direction: 'asc' }).map((x) => x.artistNorm[0]), ['alpha', 'beta', 'gamma']);
});

test('Recently added defaults can be represented newest-first', () => {
  assert.deepEqual(sortTracks(tracks, { key: 'added', direction: 'desc' }).map((x) => x.addedAt), ['2026-03-01', '2026-01-01', '2025-12-01']);
});

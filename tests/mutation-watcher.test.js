import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikePlaylistCountText } from '../src/spotify/mutation-watcher.js';
test('playlist-count mutations are detected in several Spotify UI languages', () => {
  for (const text of ['12 songs', '1 track', '13 canciones', '32 titres', '2 Titel', '3 músicas']) {
    assert.equal(looksLikePlaylistCountText(text), true, text);
  }
  assert.equal(looksLikePlaylistCountText('New release out today'), false);
});

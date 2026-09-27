import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { parseQuery } from '../src/search/parser.js';
import { normalizeTrackItem } from '../src/spotify/track-normalizer.js';
import { clearReleaseYearCache, ensureReleaseYears, queryNeedsYearMetadata } from '../src/spotify/year-metadata.js';

test('normalizer reads release year from common PlaylistAPI shapes', () => {
  const a = normalizeTrackItem({
    track: {
      uri: 'spotify:track:aaa',
      name: 'A',
      artists: [{ name: 'Artist' }],
      album: { name: 'Album', release_date: '2026-03-12' },
    },
  }, 0);
  assert.equal(a.year, 2026);

  const b = normalizeTrackItem({
    track: {
      uri: 'spotify:track:bbb',
      name: 'B',
      artists: [{ name: 'Artist' }],
      metadata: { album_title: 'Album', album_release_year: '2024' },
    },
  }, 1);
  assert.equal(b.year, 2024);
});

test('year metadata is fetched on demand through CosmosAsync', async () => {
  clearReleaseYearCache();
  state.S = {
    CosmosAsync: {
      get: async (url) => {
        assert.match(url, /api\.spotify\.com\/v1\/tracks\?ids=/);
        return {
          tracks: [
            { id: 'abc123', album: { release_date: '2026-01-05' } },
            { id: 'def456', album: { release_date: '2019' } },
          ],
        };
      },
    },
  };
  const tracks = [
    { uri: 'spotify:track:abc123', year: null },
    { uri: 'spotify:track:def456', year: null },
  ];
  const summary = await ensureReleaseYears(tracks);
  assert.equal(tracks[0].year, 2026);
  assert.equal(tracks[1].year, 2019);
  assert.equal(summary.failed, false);
  assert.equal(summary.unresolved, 0);
});

test('year metadata lookup is only needed for year filters', () => {
  assert.equal(queryNeedsYearMetadata(parseQuery('year:2026')), true);
  assert.equal(queryNeedsYearMetadata(parseQuery('>2017 & <2020')), true);
  assert.equal(queryNeedsYearMetadata(parseQuery('@Mora & -live')), false);
});

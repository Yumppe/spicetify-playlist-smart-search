import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/search/parser.js';
import { filterTracks } from '../src/search/matcher.js';

const tracks = [
  { titleNorm: 'memorias', artistNorm: ['mora', 'jhayco'], albumNorm: 'microdosis', searchText: 'memorias microdosis mora jhayco', year: 2022 },
  { titleNorm: 'apa', artistNorm: ['mora', 'quevedo'], albumNorm: 'estrella', searchText: 'apa estrella mora quevedo', year: 2019 },
  { titleNorm: 'live session', artistNorm: ['quevedo'], albumNorm: 'live', searchText: 'live session live quevedo', year: 2023 },
];

const run = (q) => filterTracks(tracks, parseQuery(q));

test('exact artist AND requires both artist credits', () => {
  assert.equal(run('@Mora & @Quevedo').length, 1);
  assert.equal(run('@Mora & @Bad Bunny').length, 0);
});

test('generic text searches title, album and artists', () => {
  assert.equal(run('microdosis;estrella').length, 2);
});

test('year range and artist can be combined', () => {
  assert.equal(run('year:>2017 & <2020 & @Mora').length, 1);
});

test('negation removes matching tracks', () => {
  assert.equal(run('@Quevedo & -live').length, 1);
});

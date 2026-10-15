import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG_URL, RELEASE_NOTES_REVISION, VERSION } from '../src/constants.js';
import { RELEASE_NOTES, WELCOME_NOTES, releaseAudience } from '../src/release-notes.js';

test('release notes are tied to the current release version and revision', () => {
  assert.equal(RELEASE_NOTES.version, VERSION);
  assert.equal(RELEASE_NOTES.revision, RELEASE_NOTES_REVISION);
  assert.equal(VERSION, '1.2');
  assert.equal(RELEASE_NOTES_REVISION, 7);
  assert.equal(RELEASE_NOTES.sections.length, 2);
  assert.deepEqual(RELEASE_NOTES.sections.map(section => section.label), [
    'Your queue stays yours', 'A little extra polish',
  ]);
  assert.equal(WELCOME_NOTES.sections.length, 2);
  assert.match(CHANGELOG_URL, /CHANGELOG\.md$/);
  assert.ok(RELEASE_NOTES.sections.every((section) => section.items.length <= 3));
});

 test('fresh installs see a welcome message; existing installs see update notes', () => {
  assert.equal(releaseAudience(''), 'welcome');
  assert.equal(releaseAudience('1.1:3'), 'update');
});

test('update notes do not repeat the queue fix as New / Improved / Fixed', () => {
  assert.ok(RELEASE_NOTES.sections.every(section => !['New', 'Improved', 'Fixed'].includes(section.label)));
  assert.match(RELEASE_NOTES.sections[0].items[0], /Remove or rearrange/);
  assert.match(RELEASE_NOTES.sections[1].items[0], /logo/);
  assert.match(RELEASE_NOTES.sections[1].items[1], /keyboard navigation/);
});

test('update uses exactly two sections and acknowledges the new logo', async () => {
  const { SMART_SEARCH_LOGO_DATA_URI, createLogoImage } = await import('../src/branding.js');
  assert.match(SMART_SEARCH_LOGO_DATA_URI, /^data:image\/png;base64,/);
  assert.deepEqual(RELEASE_NOTES.sections.map(s => s.label), ['Your queue stays yours', 'A little extra polish']);
  assert.match(RELEASE_NOTES.sections[1].items.join(' '), /new:.*logo/i);
  assert.equal(typeof createLogoImage, 'function');
});

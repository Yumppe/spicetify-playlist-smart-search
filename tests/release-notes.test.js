import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG_URL, RELEASE_NOTES_REVISION, VERSION } from '../src/constants.js';
import { RELEASE_NOTES } from '../src/release-notes.js';

test('release notes are tied to the current release version and revision', () => {
  assert.equal(RELEASE_NOTES.version, VERSION);
  assert.equal(RELEASE_NOTES.revision, RELEASE_NOTES_REVISION);
  assert.equal(VERSION, '1.1');
  assert.ok(RELEASE_NOTES.sections.length >= 3);
  assert.ok(RELEASE_NOTES.sections.some((section) => section.label === 'Fixed'));
  assert.ok(RELEASE_NOTES.sections.some((section) => section.label === 'Improved'));
  assert.ok(RELEASE_NOTES.sections.some((section) => section.label === 'New'));
  assert.match(CHANGELOG_URL, /CHANGELOG\.md$/);
  assert.ok(RELEASE_NOTES.sections.every((section) => section.items.length <= 3));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { detectCapabilities, playlistGraphQLDefinitions } from '../src/spotify/capabilities.js';

function definition(name) {
  return {
    kind: 'Document',
    definitions: [{ kind: 'OperationDefinition', name: { value: name }, variableDefinitions: [] }],
  };
}

test('GraphQL playlist definitions are discovered in QueryDefinitions too', () => {
  state.S = {
    GraphQL: {
      Request() {},
      Definitions: {},
      QueryDefinitions: { FetchPlaylistContents: definition('FetchPlaylistContents') },
    },
  };
  assert.equal(playlistGraphQLDefinitions(state.S).length, 1);
  assert.equal(detectCapabilities().graphqlPlaylistDefinition, true);
});

test('GraphQL can be present without exposing a compatible playlist definition', () => {
  state.S = { GraphQL: { Request() {}, Definitions: { fetchExtractedColors: definition('fetchExtractedColors') } } };
  const capabilities = detectCapabilities();
  assert.equal(capabilities.graphqlRequest, true);
  assert.equal(capabilities.graphqlPlaylistDefinition, false);
});

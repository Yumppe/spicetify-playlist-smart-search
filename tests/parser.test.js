import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, smartSyntaxUsed } from '../src/search/parser.js';

const ok = (query) => {
  const result = parseQuery(query);
  assert.deepEqual(result.errors, [], `Expected valid query: ${query} -> ${result.errors.join(' | ')}`);
  return result.ast;
};

test('plain text remains plain text and does not activate Smart Search', () => {
  assert.equal(smartSyntaxUsed('Mora'), false);
  assert.deepEqual(ok('Mora'), { kind: 'text', value: 'mora' });
});

test('semicolon creates OR branches', () => {
  const ast = ok('Mora;Quevedo');
  assert.equal(ast.kind, 'or');
  assert.equal(ast.children.length, 2);
});

test('ampersand creates AND branches with higher precedence than OR', () => {
  const ast = ok('@Quevedo & @Mora;Bad Bunny');
  assert.equal(ast.kind, 'or');
  assert.equal(ast.children[0].kind, 'and');
  assert.equal(ast.children[0].children.length, 2);
});

test('exact artist syntax uses @', () => {
  const ast = ok('@Mora');
  assert.deepEqual(ast, { kind: 'field', field: 'artist', value: 'mora', exact: true });
});

test('negation can wrap exact artist and text filters', () => {
  assert.equal(ok('-live').kind, 'not');
  assert.equal(ok('-@Mora').child.kind, 'field');
});

test('year equality and range syntax', () => {
  assert.deepEqual(ok('year:2020'), { kind: 'year-eq', a: 2020 });
  assert.deepEqual(ok('year:2017-2020'), { kind: 'year-range', a: 2017, b: 2020 });
});

test('year comparison syntax supports compact continuation', () => {
  const ast = ok('year:>2017 & <2020');
  assert.equal(ast.kind, 'and');
  assert.deepEqual(ast.children[0], { kind: 'year-gt', a: 2017 });
  assert.deepEqual(ast.children[1], { kind: 'year-lt', a: 2020 });
});


test('standalone year comparator shorthand activates Smart Search', () => {
  assert.equal(smartSyntaxUsed('>2017'), true);
  assert.deepEqual(ok('>2017'), { kind: 'year-gt', a: 2017 });
});

test('year comparison supports >= and <=', () => {
  const ast = ok('year:>=2017 & <=2020');
  assert.deepEqual(ast.children[0], { kind: 'year-gte', a: 2017 });
  assert.deepEqual(ast.children[1], { kind: 'year-lte', a: 2020 });
});

test('malformed year produces actionable feedback', () => {
  const result = parseQuery('year:20xx');
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Invalid year filter/);
});

test('empty branches are rejected', () => {
  assert.ok(parseQuery('Mora;;Quevedo').errors.length > 0);
  assert.ok(parseQuery('Mora && Quevedo').errors.length > 0);
});

test('escaped syntax characters stay literal', () => {
  const ast = ok('rock\\&roll');
  assert.deepEqual(ast, { kind: 'text', value: 'rock&roll' });
  assert.equal(smartSyntaxUsed('rock\\&roll'), true);
});

test('escaped @ does not create exact artist syntax', () => {
  const ast = ok('\\@home');
  assert.deepEqual(ast, { kind: 'text', value: '@home' });
  assert.equal(smartSyntaxUsed('\\@home'), true);
});


test('legacy field prefixes no longer activate Smart Search', () => {
  assert.equal(smartSyntaxUsed('artist:Mora'), false);
  assert.equal(smartSyntaxUsed('title:Memorias'), false);
  assert.equal(smartSyntaxUsed('album:Microdosis'), false);
});

test('mixed compact example parses as OR of an AND group and exact artist', () => {
  const ast = ok('year:>2017 & <2020; @Mora');
  assert.equal(ast.kind, 'or');
  assert.equal(ast.children[0].kind, 'and');
  assert.equal(ast.children[1].kind, 'field');
});

test('accents are normalized', () => {
  assert.deepEqual(ok('@MØRA'.replace('Ø', 'ó')), { kind: 'field', field: 'artist', value: 'mora', exact: true });
});

test('syntax reference documents the 1.1.x grammar without legacy field prefixes', async () => {
  const { SYNTAX_REFERENCE } = await import('../src/search/parser.js');
  const tokens = SYNTAX_REFERENCE.map((item) => item.token);
  for (const token of [';', '&', '-', '@', 'year:', '>, >=, <, <=, =', 'YYYY-YYYY', '\\']) {
    assert.ok(tokens.includes(token), `Missing syntax token: ${token}`);
  }
  const text = JSON.stringify(SYNTAX_REFERENCE);
  assert.doesNotMatch(text, /artist:|title:|track:|album:/i);
});

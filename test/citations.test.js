import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  annotateWithSupports, extractCitedIds, numberCitations, renderCitationPlaceholders, sliceUtf8,
} from '../src/agent/citations.js';
import { CITATION_RULE, RESEARCH_PROMPT_RULES, renderReport } from '../src/agent/researcher.js';

test('sliceUtf8 slices Korean text with byte offsets', () => {
  const text = '가나다 abc';
  const start = Buffer.byteLength('가');
  const end = Buffer.byteLength('가나다');
  assert.equal(sliceUtf8(text, start, end), '나다');
});

test('annotateWithSupports keeps Korean byte offsets and ignores unusable supports', () => {
  const text = '첫 문장입니다. 둘째 문장입니다.';
  const first = '첫 문장입니다.';
  const second = '둘째 문장입니다.';
  const firstEnd = Buffer.byteLength(first);
  const secondStart = Buffer.byteLength(`${first} `);
  const secondEnd = Buffer.byteLength(text);
  const supports = [
    { segment: { startIndex: 0, endIndex: firstEnd, text: first }, groundingChunkIndices: [0, 2] },
    { segment: { startIndex: secondStart, endIndex: secondEnd, text: second }, groundingChunkIndices: [1] },
    { segment: { startIndex: 999, endIndex: 1005, text: '없는 문장' }, groundingChunkIndices: [0] },
  ];
  const annotated = annotateWithSupports(text, supports, (index) => ({ 0: 3, 1: 7, 2: 3 })[index]);
  assert.equal(annotated, '첫 문장입니다. [S3] 둘째 문장입니다. [S7]');
  assert.equal(annotateWithSupports(text, [
    { segment: { startIndex: 0, endIndex: firstEnd, text: first }, groundingChunkIndices: [99] },
  ], () => undefined), text);
});

test('citation helpers preserve first appearance and render adjacent notes', () => {
  assert.deepEqual(extractCitedIds('a [S9] b [S2][S9]'), [9, 2]);
  const numbered = numberCitations('a [S9] [S2] b [S9] c [S77]', new Set([9, 2]));
  assert.deepEqual(numbered.order, [9, 2]);
  assert.equal(numbered.body, 'a ⟦C1⟧⟦C2⟧ b ⟦C1⟧ c ');
  assert.equal(
    renderCitationPlaceholders('x ⟦C1⟧⟦C2⟧.'),
    'x <sup class="cite"><a href="#src-1">1</a></sup><sup class="cite"><a href="#src-2">2</a></sup>.',
  );
});

test('renderReport numbers table citations and renders a plain footer', () => {
  const html = renderReport({
    topic: '인용 테스트', tier: '라이트',
    body: '| 항목 | 값 |\n| --- | --- |\n| 시장 | 10 [S1] |',
    sources: [{ id: 1, title: '통계청', uri: 'https://kostat.go.kr/a', domain: 'kostat.go.kr', category: 'public' }],
    costs: { llmTokens: 123, paidApiUsd: 0.1 }, payment: null, visuals: null,
  });
  assert.match(html, /<td>10 <sup class="cite"><a href="#src-1">1<\/a><\/sup><\/td>/);
  assert.match(html, /<li id="src-1">/);
  assert.match(html, /인용 출처 \(1\)/);
  assert.match(html, /<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다\.<\/footer>/);
  assert.doesNotMatch(html, /원가|basescan/);
});

test('research prompt guards require primary-source priority and citation retention', () => {
  assert.match(RESEARCH_PROMPT_RULES, /출처 우선순위/);
  assert.match(RESEARCH_PROMPT_RULES, /개인 블로그/);
  assert.match(CITATION_RULE, /\[S숫자\]/);
});

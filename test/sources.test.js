import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyDomain, hostOf, needsSourceEnrichment, parseSourcesSection, renderSourcesSection,
  replaceSourcesSection, resolveSources, sourceDeps,
} from '../src/agent/sources.js';

const redirectUri = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc';
const location = 'https://www.korea.kr/briefing/policy';

function response({ status = 200, headers = {}, body = null, text = '' } = {}) {
  return { status, headers: new Headers(headers), body, text: async () => text };
}

function htmlBody(html) {
  return new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(html)); controller.close(); },
  });
}

test('classifyDomain follows credibility rules', () => {
  assert.equal(classifyDomain('korea.kr'), 'public');
  assert.equal(classifyDomain('kdi.re.kr'), 'research');
  assert.equal(classifyDomain('mk.co.kr'), 'news');
  assert.equal(classifyDomain('news33.net'), 'news');
  assert.equal(classifyDomain('korcham.net'), 'org');
  assert.equal(classifyDomain('kfme.or.kr'), 'org');
  assert.equal(classifyDomain('kbthink.com'), 'other');
  assert.equal(classifyDomain('data.go.kr'), 'public');
  assert.equal(classifyDomain('snu.ac.kr'), 'research');
});

test('hostOf strips www and rejects junk', () => {
  assert.equal(hostOf('https://www.korea.kr/a/b'), 'korea.kr');
  assert.equal(hostOf('not a url'), '');
});

test('resolveSources resolves redirects and decodes page title', async () => {
  const calls = [];
  sourceDeps.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === redirectUri) return response({ status: 302, headers: { location } });
    return response({ headers: { 'content-type': 'text/html; charset=utf-8' }, body: htmlBody('<html><head><title>2026년 &amp; 창업지원 안내</title></head></html>') });
  };
  const [result] = await resolveSources([{ title: 'korea.kr', uri: redirectUri }]);
  assert.deepEqual(result, { title: '2026년 & 창업지원 안내', uri: location, domain: 'korea.kr', category: 'public' });
  assert.equal(calls[0].options.redirect, 'manual');
});

test('resolveSources keeps source on failure with title domain fallback', async () => {
  sourceDeps.fetch = async () => { throw new Error('offline'); };
  const [result] = await resolveSources([{ title: 'korea.kr', uri: redirectUri }]);
  assert.deepEqual(result, { title: 'korea.kr', uri: redirectUri, domain: 'korea.kr', category: 'public' });
});

test('resolveSources marks expired grounding redirects dead without fetching them as pages', async () => {
  const calls = [];
  sourceDeps.fetch = async (url) => {
    calls.push(url);
    return response({ status: 404, headers: { 'content-type': 'text/html' }, text: '<title>Error 404 (Not Found)!!1</title>' });
  };
  const [result] = await resolveSources([{ title: 'korea.kr', uri: redirectUri }]);
  assert.deepEqual(result, { title: 'korea.kr', uri: redirectUri, domain: 'korea.kr', category: 'public', dead: true });
  assert.deepEqual(calls, [redirectUri]);
});

test('resolveSources times out without throwing', async () => {
  sourceDeps.fetch = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const started = Date.now();
  const [result] = await resolveSources([{ title: 'korea.kr', uri: redirectUri }], { timeoutMs: 20 });
  assert.ok(Date.now() - started < 500);
  assert.equal(result.category, 'public');
  assert.equal(result.uri, redirectUri);
});

test('resolveSources retains original title for non-html response', async () => {
  sourceDeps.fetch = async (url) => (url === redirectUri
    ? response({ status: 302, headers: { location } })
    : response({ headers: { 'content-type': 'application/pdf' }, text: 'not html' }));
  const [result] = await resolveSources([{ title: '원래 제목', uri: redirectUri }]);
  assert.equal(result.title, '원래 제목');
});

test('resolveSources observes the body byte cap', async () => {
  let pulled = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulled += 32768;
      controller.enqueue(new Uint8Array(32768));
      if (pulled >= 1024 * 1024) controller.close();
    },
  });
  sourceDeps.fetch = async (url) => (url === redirectUri
    ? response({ status: 302, headers: { location } })
    : response({ headers: { 'content-type': 'text/html' }, body }));
  const [result] = await resolveSources([{ title: '원래 제목', uri: redirectUri }], { maxBytes: 65536 });
  assert.equal(result.title, '원래 제목');
  assert.ok(pulled < 1024 * 1024);
});

test('resolveSources limits concurrency and deduplicates final URLs', async () => {
  let active = 0;
  let maximum = 0;
  sourceDeps.fetch = async (url) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return url.includes('grounding-api-redirect')
      ? response({ status: 302, headers: { location } })
      : response({ headers: { 'content-type': 'text/html' }, body: htmlBody('<title>정부</title>') });
  };
  const twenty = Array.from({ length: 20 }, (_, index) => ({ title: `제목 ${index}`, uri: `${redirectUri}${index}` }));
  const resolved = await resolveSources(twenty, { concurrency: 3 });
  assert.ok(maximum <= 3);
  assert.equal(resolved.length, 1);
});

test('render and legacy source helpers retain safe, replaceable markup', () => {
  const rendered = renderSourcesSection([
    { title: '<정부>', uri: 'https://korea.kr/a', domain: 'korea.kr', category: 'public' },
    { title: 'mk.co.kr', uri: 'https://mk.co.kr/a', domain: 'mk.co.kr', category: 'news' },
    { title: '연구', uri: 'https://kdi.re.kr/a', domain: 'kdi.re.kr', category: 'research' },
  ]);
  assert.match(rendered, /data-sources="v2"/);
  assert.match(rendered, /공공·정부 1 · 연구·학술 1 · 언론 1/);
  assert.ok(rendered.indexOf('공공·정부 (1)') < rendered.indexOf('연구·학술 (1)'));
  assert.ok(rendered.indexOf('연구·학술 (1)') < rendered.indexOf('언론 (1)'));
  assert.match(rendered, /&lt;정부&gt;/);
  assert.ok(!rendered.includes('협회·기관 ('));
  assert.ok(!rendered.includes('<span class="dom">mk.co.kr</span>'));

  const legacy = `<article><div class="sources"><strong>참고 출처 (2)</strong><ul><li><a href="U" target="_blank" rel="noopener">T</a></li><li><a href="V" target="_blank" rel="noopener">W</a></li></ul></div><p>끝</p></article>`;
  assert.deepEqual(parseSourcesSection(legacy), [{ title: 'T', uri: 'U' }, { title: 'W', uri: 'V' }]);
  assert.equal(replaceSourcesSection(legacy, '<div class="sources">새것</div>'), '<article><div class="sources">새것</div><p>끝</p></article>');
  assert.equal(needsSourceEnrichment(legacy.replace('href="U"', `href="${redirectUri}"`)), true);
  assert.equal(needsSourceEnrichment(rendered), false);
  assert.equal(needsSourceEnrichment('<p>출처 없음</p>'), false);
});

test('renderSourcesSection labels expired sources without links', () => {
  const withDead = renderSourcesSection([
    { title: 'korea.kr', uri: redirectUri, domain: 'korea.kr', category: 'public', dead: true },
    { title: '뉴스', uri: 'https://mk.co.kr/a', domain: 'mk.co.kr', category: 'news' },
  ]);
  assert.match(withDead, /<li><span class="dead">korea\.kr<\/span> <span class="dom">링크 만료<\/span><\/li>/);
  assert.doesNotMatch(withDead, new RegExp(`<a href="${redirectUri}"`));
  assert.match(withDead, /일부 링크는 검색 제공자의 보존 기간\(약 30일\)이 지나 만료되어 도메인만 표시합니다\./);

  const withoutDead = renderSourcesSection([
    { title: '뉴스', uri: 'https://mk.co.kr/a', domain: 'mk.co.kr', category: 'news' },
  ]);
  assert.doesNotMatch(withoutDead, /일부 링크는 검색 제공자의 보존 기간/);
});

test('renderSourcesSection collapses expired sources by domain within each category', () => {
  const rendered = renderSourcesSection([
    { title: 'korea.kr', uri: `${redirectUri}/one`, domain: 'korea.kr', category: 'public', dead: true },
    { title: 'korea.kr', uri: `${redirectUri}/two`, domain: 'korea.kr', category: 'public', dead: true },
    { title: 'mss.go.kr', uri: `${redirectUri}/three`, domain: 'mss.go.kr', category: 'public', dead: true },
  ]);
  const publicSection = /<h4>공공·정부 \(3\)<\/h4><ul>([\s\S]*?)<\/ul>/.exec(rendered)?.[1] || '';

  assert.match(rendered, /참고 출처 \(3\)/);
  assert.match(rendered, /공공·정부 3/);
  assert.match(rendered, /공공·정부 \(3\)/);
  assert.equal((publicSection.match(/<li>/g) || []).length, 2);
  assert.equal((publicSection.match(/<span class="dead">/g) || []).length, 2);
  assert.match(publicSection, /<span class="dead">korea\.kr<\/span> <span class="dom">2건 · 링크 만료<\/span>/);
  assert.match(publicSection, /<span class="dead">mss\.go\.kr<\/span> <span class="dom">링크 만료<\/span>/);
});

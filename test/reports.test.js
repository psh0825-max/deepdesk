import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

process.env.DEEPDESK_NO_LISTEN = '1';
process.env.DEEPDESK_TEST_NO_RUN = '1';
delete process.env.K_SERVICE;
delete process.env.DEEPDESK_STORE;
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'deepdesk-reports-')));

const { app, enrichLegacyReport, stripAgentFooter } = await import('../server.js');
const { sourceDeps } = await import('../src/agent/sources.js');
const { getReport } = await import('../src/store.js');
const body = '<main><h1>리포트 본문</h1><p>바이트 동일성 확인</p></main>';
const footer = '<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다. 리서치 원가: LLM 토큰 12,345개 · 유료 데이터 $0.10 (<a href="https://sepolia.basescan.org/tx/0xabc">에이전트 결제 트랜잭션 보기</a>)</footer>';
let server;
let baseUrl;

before(async () => {
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(path.resolve('reports/abcd1234.html'), `${body}${footer}`);
  fs.writeFileSync(path.resolve('reports/a1b2c3d4.html'), `<main>레거시</main><div class="sources"><strong>참고 출처 (2)</strong><ul><li><a href="https://vertexaisearch.cloud.google.com/grounding-api-redirect/a" target="_blank" rel="noopener">korea.kr</a></li><li><a href="https://vertexaisearch.cloud.google.com/grounding-api-redirect/b" target="_blank" rel="noopener">mk.co.kr</a></li></ul></div>${footer}`);
  fs.writeFileSync(path.resolve('reports/a1b2c3e4.html'), `<main>v2</main><div class="sources" data-sources="v2"><strong>참고 출처 (0)</strong></div>${footer}`);
  server = http.createServer(app).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('web reports replace the agent payment footer', async () => {
  const response = await fetch(`${baseUrl}/reports/abcd1234.html`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!html.includes('basescan'));
  assert.ok(!html.includes('원가'));
  assert.ok(html.includes('<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다.</footer>'));
});

test('app reports replace the agent payment footer', async () => {
  const response = await fetch(`${baseUrl}/reports/abcd1234.html?app=1`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!html.includes('basescan'));
  assert.ok(!html.includes('원가'));
  assert.ok(html.includes('<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다.</footer>'));
  assert.equal(html.slice(0, html.indexOf('<footer>')), body);
});

test('app client header replaces the agent payment footer', async () => {
  const response = await fetch(`${baseUrl}/reports/abcd1234.html`, {
    headers: { 'X-DeepDesk-Client': 'app' },
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!html.includes('basescan'));
  assert.ok(html.includes('<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다.</footer>'));
});

test('stripAgentFooter keeps reports without a footer unchanged', () => {
  const html = '<main>footer 없는 리포트</main>';
  assert.equal(stripAgentFooter(html), html);
});

test('unknown app report remains not found', async () => {
  const response = await fetch(`${baseUrl}/reports/deadbeef.html?app=1`);
  assert.equal(response.status, 404);
});

test('sample report alias redirects to the configured report ID', async () => {
  const response = await fetch(`${baseUrl}/reports/sample.html`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/reports/f3949e85.html');

  process.env.SAMPLE_REPORT_ID = 'abcd1234';
  const { app: configuredApp } = await import(`../server.js?sample=${Date.now()}`);
  const configuredServer = http.createServer(configuredApp).listen(0);
  await once(configuredServer, 'listening');
  try {
    const configuredUrl = `http://127.0.0.1:${configuredServer.address().port}`;
    const configured = await fetch(`${configuredUrl}/reports/sample.html`, { redirect: 'manual' });
    assert.equal(configured.status, 302);
    assert.equal(configured.headers.get('location'), '/reports/abcd1234.html');
  } finally {
    delete process.env.SAMPLE_REPORT_ID;
    await new Promise((resolve) => configuredServer.close(resolve));
  }
});

test('legacy reports respond immediately and can self-heal with resolved sources', async () => {
  const redirect = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/';
  sourceDeps.fetch = async (url) => (String(url).startsWith(redirect)
    ? { status: 302, headers: new Headers({ location: 'https://www.korea.kr/policy' }) }
    : { status: 200, headers: new Headers({ 'content-type': 'text/html' }), body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<title>정책 원문</title>')); c.close(); } }) });
  const original = await getReport('a1b2c3d4');
  const first = await fetch(`${baseUrl}/reports/a1b2c3d4.html`);
  assert.equal(await first.text(), stripAgentFooter(original));
  await enrichLegacyReport('a1b2c3d4', original);
  const stored = await getReport('a1b2c3d4');
  assert.match(stored, /data-sources="v2"/);
  assert.match(stored, /정책 원문/);
  const second = await fetch(`${baseUrl}/reports/a1b2c3d4.html?app=1`);
  const html = await second.text();
  assert.match(html, /data-sources="v2"/);
  assert.ok(!html.includes('원가'));
});

test('v2 reports do not start source enrichment fetches', async () => {
  let calls = 0;
  sourceDeps.fetch = async () => { calls += 1; throw new Error('must not fetch'); };
  const response = await fetch(`${baseUrl}/reports/a1b2c3e4.html`);
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 0);
});

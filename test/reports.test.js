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

const { app, stripAgentFooter } = await import('../server.js');
const body = '<main><h1>리포트 본문</h1><p>바이트 동일성 확인</p></main>';
const footer = '<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다. 리서치 원가: LLM 토큰 12,345개 · 유료 데이터 $0.10 (<a href="https://sepolia.basescan.org/tx/0xabc">에이전트 결제 트랜잭션 보기</a>)</footer>';
let server;
let baseUrl;

before(async () => {
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(path.resolve('reports/abcd1234.html'), `${body}${footer}`);
  server = http.createServer(app).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('web reports retain the agent payment footer', async () => {
  const response = await fetch(`${baseUrl}/reports/abcd1234.html`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes('basescan'));
  assert.ok(html.includes(footer));
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

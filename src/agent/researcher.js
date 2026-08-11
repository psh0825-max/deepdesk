// DeepDesk 리서치 에이전트 파이프라인
// 계획(plan) → 조사(gather, Google 검색 그라운딩) → 종합(synthesize) → 리포트 저장
// 각 단계 진행상황과 비용(토큰/유료API)을 주문 레코드에 기록한다.
import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { appendProgress, updateOrder } from '../store.js';
import { pay } from './wallet.js';

const REPORTS_DIR = path.resolve('reports');

const TIER_SPEC = {
  light: { subQuestions: 4, label: '라이트' },
  standard: { subQuestions: 7, label: '스탠다드' },
  deep: { subQuestions: 10, label: '딥' },
};

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다 (.env 참고)');
  }
  const vertexai = process.env.GEMINI_USE_VERTEX === '1';
  return new GoogleGenAI({ vertexai, apiKey });
}

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function addUsage(costs, response) {
  const u = response.usageMetadata;
  if (u) costs.llmTokens += (u.promptTokenCount || 0) + (u.candidatesTokenCount || 0);
}

async function generate(ai, { prompt, useSearch, costs }) {
  const response = await ai.models.generateContent({
    model: MODEL(),
    contents: prompt,
    config: useSearch ? { tools: [{ googleSearch: {} }] } : undefined,
  });
  addUsage(costs, response);
  const sources = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  for (const c of chunks) {
    if (c.web?.uri) sources.push({ title: c.web.title || c.web.uri, uri: c.web.uri });
  }
  return { text: response.text, sources };
}

export async function runResearch(order) {
  const { id, topic, brief, tier, language } = order;
  const spec = TIER_SPEC[tier] || TIER_SPEC.light;
  const lang = language === 'en' ? 'English' : '한국어';
  const ai = client();
  const costs = { llmTokens: 0, paidApiUsd: 0 };

  try {
    await updateOrder(id, { status: 'running' });
    await appendProgress(id, `조사 시작 (${spec.label} 티어, ${spec.subQuestions}개 세부 질문)`);

    // 1) 계획
    const plan = await generate(ai, {
      costs,
      prompt: `You are a professional research analyst. Break the following research request into exactly ${spec.subQuestions} focused sub-questions that together fully cover the topic. Answer as a numbered list only, in ${lang}.

Topic: ${topic}
${brief ? `Client brief: ${brief}` : ''}`,
    });
    const subQuestions = plan.text
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, spec.subQuestions);
    await appendProgress(id, `조사 계획 수립: ${subQuestions.length}개 세부 질문`);

    // 2) 조사 (검색 그라운딩)
    const findings = [];
    const allSources = [];
    for (let i = 0; i < subQuestions.length; i++) {
      const q = subQuestions[i];
      const r = await generate(ai, {
        costs,
        useSearch: true,
        prompt: `Research the following question thoroughly using current web information. Write a dense, factual summary in ${lang} (300-500 words) with concrete figures, dates, and names where available. Question: ${q}`,
      });
      findings.push({ question: q, answer: r.text, sources: r.sources });
      allSources.push(...r.sources);
      await appendProgress(id, `세부 조사 ${i + 1}/${subQuestions.length} 완료 (출처 ${r.sources.length}건)`);
      await updateOrder(id, { costs });
    }

    // 3) 유료 데이터 단계 — 에이전트가 자기 지갑으로 직접 결제 (가드레일 내, 실패 시 무료 경로 폴백)
    let payment = null;
    const paid = await pay({
      service: 'premium-data',
      amountUsd: 0.1,
      orderId: id,
      memo: `premium data for order ${id}`,
    });
    if (paid.ok) {
      payment = paid;
      costs.paidApiUsd += paid.amountUsd;
      await appendProgress(id, `유료 데이터 결제 — $${paid.amountUsd.toFixed(2)} USDC (tx ${paid.txHash ? paid.txHash.slice(0, 12) + '…' : paid.txId})`);
      await updateOrder(id, { costs, lastPayment: { txHash: paid.txHash, explorerUrl: paid.explorerUrl } });
    } else {
      await appendProgress(id, `유료 데이터 생략 (${paid.reason}) — 무료 출처로 진행`);
    }

    // 4) 종합
    const synthesis = await generate(ai, {
      costs,
      prompt: `You are writing the final client-facing research report in ${lang}, in Markdown.

Topic: ${topic}
${brief ? `Client brief: ${brief}` : ''}

Findings from research team:
${findings.map((f, i) => `## Sub-question ${i + 1}: ${f.question}\n${f.answer}`).join('\n\n')}

Write a complete, well-structured report with: 제목, 요약(Executive Summary), 핵심 발견 사항(불릿), 각 주제별 상세 분석, 시사점 및 권고, 한계와 추가 조사 제안. Be specific and cite figures. Do not invent facts not present in the findings.`,
    });

    // 5) 시각화 데이터 추출 — 리포트에 등장한 수치만 사용 (창작 금지)
    let visuals = null;
    try {
      const vres = await generate(ai, {
        costs,
        prompt: `다음은 완성된 리서치 리포트다. 이 리포트에 실제로 등장하는 수치만 사용해 시각화 데이터를 JSON으로 추출하라. 수치를 새로 만들거나 추정하지 마라.

형식:
{"stats":[{"label":"항목명(15자 이내)","value":"수치+단위","note":"연도/출처 맥락(20자 이내)"}],
 "charts":[{"type":"bar 또는 line","title":"차트 제목","unit":"단위","labels":["항목1"],"series":[{"name":"계열명","values":[1.0]}],"note":"근거 한 줄"}]}

규칙:
- stats: 가장 중요한 수치 4~6개
- charts: 2~4개. 연도별 추이=line, 항목 비교=bar. labels 최대 8개, series 최대 3개, values는 순수 숫자(단위는 unit 필드에)
- 수치가 범위면 대표값 하나를 쓰고 note에 범위를 명시
- 차트로 만들 수치가 부족하면 개수를 줄여라. JSON 외 텍스트 출력 금지.

리포트:
${synthesis.text}`,
      });
      visuals = parseVisuals(vres.text);
      await appendProgress(id, `시각화 생성 — 핵심지표 ${visuals?.stats?.length || 0}개, 차트 ${visuals?.charts?.length || 0}개`);
    } catch (e) {
      await appendProgress(id, `시각화 추출 생략 (${e.message})`);
    }

    // 6) 리포트 저장 (HTML)
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const uniqueSources = [...new Map(allSources.map((s) => [s.uri, s])).values()];
    const html = renderReport({ topic, tier: spec.label, body: synthesis.text, sources: uniqueSources, costs, payment, visuals });
    const reportPath = path.join(REPORTS_DIR, `${id}.html`);
    await fs.writeFile(reportPath, html);

    await updateOrder(id, { status: 'done', reportPath: `/reports/${id}.html`, costs });
    await appendProgress(id, `리포트 완성 — 출처 ${uniqueSources.length}건, LLM 토큰 ${costs.llmTokens.toLocaleString()}개 사용`);
    return { ok: true, reportPath: `/reports/${id}.html` };
  } catch (err) {
    await updateOrder(id, { status: 'failed', costs });
    await appendProgress(id, `오류: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 최소 Markdown → HTML (외부 의존성 없이 헤딩/목록/표/굵게/링크)
function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let list = null; // 'ul' | 'ol'
  let tableBuf = [];

  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const flushTable = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf.map((l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
    tableBuf = [];
    if (rows.length >= 2 && rows[1].length > 0 && rows[1].every((c) => /^:?-{2,}:?$/.test(c))) {
      const [head, , ...body] = rows;
      html += '<div class="tbl"><table><thead><tr>'
        + head.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
        + '</tbody></table></div>';
    } else {
      for (const r of rows) html += `<p>${inline(r.join(' · '))}</p>`;
    }
  };

  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) { closeList(); tableBuf.push(line); continue; }
    flushTable();

    const h = line.match(/^(#{1,4})\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (h) {
      closeList();
      const level = h[1].length + 1;
      html += `<h${level}>${inline(h[2])}</h${level}>`;
    } else if (ul || ol) {
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { closeList(); html += `<${want}>`; list = want; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  flushTable();
  closeList();
  return html;

  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
}

// ---------- 시각화 (팔레트: dataviz 검증 통과 — 흰 배경, 3슬롯 all-pairs, aqua는 값 라벨 필수) ----------
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];
const INK = { text: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', baseline: '#c3c2b7' };

function parseVisuals(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const v = JSON.parse(m[0]);
  const stats = (Array.isArray(v.stats) ? v.stats : [])
    .filter((s) => s && s.label && s.value)
    .slice(0, 6)
    .map((s) => ({ label: String(s.label), value: String(s.value), note: s.note ? String(s.note) : '' }));
  const charts = (Array.isArray(v.charts) ? v.charts : []).map(cleanChart).filter(Boolean).slice(0, 4);
  if (stats.length === 0 && charts.length === 0) return null;
  return { stats, charts };
}

function cleanChart(c) {
  if (!c || !Array.isArray(c.labels) || !Array.isArray(c.series)) return null;
  const labels = c.labels.slice(0, 8).map(String);
  const series = c.series
    .slice(0, 3)
    .map((s) => ({
      name: String(s?.name || ''),
      values: (Array.isArray(s?.values) ? s.values : []).slice(0, labels.length).map(Number),
    }))
    .filter((s) => s.values.length === labels.length && s.values.every(Number.isFinite));
  if (labels.length < 2 || series.length === 0) return null;
  return {
    type: c.type === 'line' ? 'line' : 'bar',
    title: String(c.title || ''),
    unit: c.unit ? String(c.unit) : '',
    note: c.note ? String(c.note) : '',
    labels,
    series,
  };
}

function niceMax(v) {
  if (!(v > 0)) return 1;
  const k = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) if (m * k >= v) return m * k;
  return 10 * k;
}

function fmt(n) {
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return r.toLocaleString('ko-KR');
}

function trunc(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// 데이터 끝(위쪽)만 둥근 막대 — 베이스라인에 각지게 붙는다
function roundedTopRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function chartFrame({ title, unit, series }) {
  const W = 640, H = 300, L = 52, R = 16, T = 52, B = 46;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const plotW = W - L - R, plotH = H - T - B;
  const y = (v) => T + plotH - (Math.max(v, 0) / max) * plotH;
  let head = `<text x="${L}" y="20" font-size="13" font-weight="600" fill="${INK.text}">${esc(title)}</text>`;
  if (unit) head += `<text x="${W - R}" y="20" font-size="11" text-anchor="end" fill="${INK.muted}">단위: ${esc(unit)}</text>`;
  if (series.length > 1) {
    let lx = L;
    series.forEach((s, i) => {
      const name = trunc(s.name, 14);
      head += `<circle cx="${lx + 5}" cy="34" r="5" fill="${SERIES_COLORS[i]}"/>`
        + `<text x="${lx + 14}" y="38" font-size="11" fill="${INK.secondary}">${esc(name)}</text>`;
      lx += 14 + name.length * 11 + 18;
    });
  }
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const yy = y(v);
    grid += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="${i === 0 ? INK.baseline : INK.grid}" stroke-width="1"/>`
      + `<text x="${L - 6}" y="${yy + 4}" font-size="10" text-anchor="end" fill="${INK.muted}">${fmt(v)}</text>`;
  }
  return { W, H, L, R, T, plotW, plotH, y, head, grid };
}

function barChartSVG(c) {
  const f = chartFrame(c);
  const n = c.labels.length, sN = c.series.length;
  const groupW = f.plotW / n;
  const barW = Math.min(sN === 1 ? groupW * 0.5 : (groupW * 0.72 - 2 * (sN - 1)) / sN, 64);
  let marks = '';
  c.labels.forEach((label, i) => {
    const cx = f.L + groupW * i + groupW / 2;
    const total = sN * barW + (sN - 1) * 2;
    c.series.forEach((s, si) => {
      const v = s.values[i];
      const x = cx - total / 2 + si * (barW + 2);
      const yy = f.y(v);
      const h = Math.max(f.y(0) - yy, 1);
      marks += `<path d="${roundedTopRect(x, yy, barW, h, 4)}" fill="${SERIES_COLORS[si]}">`
        + `<title>${esc((sN > 1 ? s.name + ' · ' : '') + label)}: ${fmt(v)}${c.unit ? ' ' + esc(c.unit) : ''}</title></path>`;
      if (n * sN <= 12) {
        marks += `<text x="${x + barW / 2}" y="${yy - 5}" font-size="10" text-anchor="middle" fill="${INK.secondary}">${fmt(v)}</text>`;
      }
    });
    marks += `<text x="${cx}" y="${f.T + f.plotH + 16}" font-size="10.5" text-anchor="middle" fill="${INK.muted}">${esc(trunc(label, 9))}</text>`;
  });
  return svgWrap(f, marks);
}

function lineChartSVG(c) {
  const f = chartFrame(c);
  const n = c.labels.length;
  const x = (i) => f.L + (n === 1 ? f.plotW / 2 : (f.plotW * i) / (n - 1));
  let marks = '';
  c.series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${x(i)},${f.y(v)}`).join(' ');
    marks += `<polyline points="${pts}" fill="none" stroke="${SERIES_COLORS[si]}" stroke-width="2"/>`;
    const peak = Math.max(...s.values);
    s.values.forEach((v, i) => {
      marks += `<circle cx="${x(i)}" cy="${f.y(v)}" r="4" fill="${SERIES_COLORS[si]}" stroke="#fff" stroke-width="2">`
        + `<title>${esc((c.series.length > 1 ? s.name + ' · ' : '') + c.labels[i])}: ${fmt(v)}${c.unit ? ' ' + esc(c.unit) : ''}</title></circle>`;
      if (i === 0 || i === n - 1 || v === peak) {
        marks += `<text x="${x(i)}" y="${f.y(v) - 9}" font-size="10" text-anchor="middle" fill="${INK.secondary}">${fmt(v)}</text>`;
      }
    });
  });
  c.labels.forEach((label, i) => {
    marks += `<text x="${x(i)}" y="${f.T + f.plotH + 16}" font-size="10.5" text-anchor="middle" fill="${INK.muted}">${esc(trunc(label, 9))}</text>`;
  });
  return svgWrap(f, marks);
}

function svgWrap(f, marks) {
  return `<svg viewBox="0 0 ${f.W} ${f.H}" xmlns="http://www.w3.org/2000/svg" role="img" font-family="'Segoe UI',Pretendard,sans-serif">${f.head}${f.grid}${marks}</svg>`;
}

function renderVisualBlock({ stats, charts }) {
  let html = '<section class="viz"><h2>한눈에 보기</h2>';
  if (stats.length) {
    html += '<div class="stats">' + stats.map((s) =>
      `<div class="stat"><div class="v">${esc(s.value)}</div><div class="l">${esc(s.label)}</div>${s.note ? `<div class="n">${esc(s.note)}</div>` : ''}</div>`
    ).join('') + '</div>';
  }
  for (const c of charts) {
    html += `<figure class="chart">${c.type === 'line' ? lineChartSVG(c) : barChartSVG(c)}${c.note ? `<figcaption>${esc(c.note)}</figcaption>` : ''}</figure>`;
  }
  return html + '</section>';
}

function renderReport({ topic, tier, body, sources, costs, payment, visuals }) {
  let bodyHtml = mdToHtml(body);
  if (visuals) {
    const vh = renderVisualBlock(visuals);
    const m = bodyHtml.match(/<\/h[12]>/);
    bodyHtml = m
      ? bodyHtml.slice(0, m.index + m[0].length) + vh + bodyHtml.slice(m.index + m[0].length)
      : vh + bodyHtml;
  }
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(topic)} — DeepDesk 리서치 리포트</title>
<style>
body{font-family:'Segoe UI',Pretendard,sans-serif;max-width:820px;margin:0 auto;padding:48px 24px;line-height:1.7;color:#1a2333}
h1{font-size:1.9rem;border-bottom:3px solid #2563eb;padding-bottom:12px}
h2{font-size:1.4rem;margin-top:2.2em;color:#1d4ed8}
h3{font-size:1.15rem;margin-top:1.6em}
a{color:#2563eb}
.meta{color:#64748b;font-size:.9rem;margin-bottom:2em}
.viz{background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px 28px;margin:28px 0}
.viz h2{margin-top:0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:8px}
.stat{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}
.stat .v{font-size:1.35rem;font-weight:800;color:#0b0b0b}
.stat .l{font-size:.82rem;color:#52514e;margin-top:2px}
.stat .n{font-size:.72rem;color:#898781;margin-top:2px}
.chart{margin:20px 0 4px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px}
.chart svg{width:100%;height:auto;display:block}
.chart figcaption{font-size:.78rem;color:#898781;padding:6px 8px 2px}
.tbl{overflow-x:auto;margin:14px 0}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{border:1px solid #e1e0d9;padding:8px 10px;text-align:left}
th{background:#f1f5f9}
td{font-variant-numeric:tabular-nums}
.sources{background:#f1f5f9;border-radius:12px;padding:20px 28px;margin-top:3em;font-size:.9rem}
footer{margin-top:4em;color:#94a3b8;font-size:.85rem;border-top:1px solid #e2e8f0;padding-top:16px}
</style></head><body>
<div class="meta">DeepDesk 리서치 리포트 · ${esc(tier)} 티어 · ${new Date().toISOString().slice(0, 10)}</div>
${bodyHtml}
<div class="sources"><strong>참고 출처 (${sources.length})</strong><ul>
${sources.map((s) => `<li><a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('\n')}
</ul></div>
<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다. 리서치 원가: LLM 토큰 ${costs.llmTokens.toLocaleString()}개 · 유료 데이터 $${costs.paidApiUsd.toFixed(2)}${payment?.explorerUrl ? ` (<a href="${esc(payment.explorerUrl)}" target="_blank" rel="noopener">에이전트 결제 트랜잭션 보기</a>)` : ''}</footer>
</body></html>`;
}

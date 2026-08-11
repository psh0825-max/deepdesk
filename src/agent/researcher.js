// DeepDesk 리서치 에이전트 파이프라인
// 계획(plan) → 조사(gather, Google 검색 그라운딩) → 종합(synthesize) → 리포트 저장
// 각 단계 진행상황과 비용(토큰/유료API)을 주문 레코드에 기록한다.
import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { appendProgress, updateOrder } from '../store.js';

const REPORTS_DIR = path.resolve('reports');

const TIER_SPEC = {
  light: { subQuestions: 4, label: '라이트' },
  standard: { subQuestions: 7, label: '스탠다드' },
  deep: { subQuestions: 10, label: '딥' },
};

function client() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다 (.env 참고)');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

    // 3) 종합
    const synthesis = await generate(ai, {
      costs,
      prompt: `You are writing the final client-facing research report in ${lang}, in Markdown.

Topic: ${topic}
${brief ? `Client brief: ${brief}` : ''}

Findings from research team:
${findings.map((f, i) => `## Sub-question ${i + 1}: ${f.question}\n${f.answer}`).join('\n\n')}

Write a complete, well-structured report with: 제목, 요약(Executive Summary), 핵심 발견 사항(불릿), 각 주제별 상세 분석, 시사점 및 권고, 한계와 추가 조사 제안. Be specific and cite figures. Do not invent facts not present in the findings.`,
    });

    // 4) 리포트 저장 (HTML)
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const uniqueSources = [...new Map(allSources.map((s) => [s.uri, s])).values()];
    const html = renderReport({ topic, tier: spec.label, body: synthesis.text, sources: uniqueSources, costs });
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

// 최소 Markdown → HTML (외부 의존성 없이 헤딩/불릿/굵게/링크만)
function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (h) {
      if (inList) { html += '</ul>'; inList = false; }
      const level = h[1].length + 1;
      html += `<h${level}>${inline(h[2])}</h${level}>`;
    } else if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(li[1])}</li>`;
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;

  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
}

function renderReport({ topic, tier, body, sources, costs }) {
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
.sources{background:#f1f5f9;border-radius:12px;padding:20px 28px;margin-top:3em;font-size:.9rem}
footer{margin-top:4em;color:#94a3b8;font-size:.85rem;border-top:1px solid #e2e8f0;padding-top:16px}
</style></head><body>
<div class="meta">DeepDesk 리서치 리포트 · ${esc(tier)} 티어 · ${new Date().toISOString().slice(0, 10)}</div>
${mdToHtml(body)}
<div class="sources"><strong>참고 출처 (${sources.length})</strong><ul>
${sources.map((s) => `<li><a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('\n')}
</ul></div>
<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다. 리서치 원가: LLM 토큰 ${costs.llmTokens.toLocaleString()}개 · 유료 데이터 $${costs.paidApiUsd.toFixed(2)}</footer>
</body></html>`;
}

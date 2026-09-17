// DeepDesk 리서치 에이전트 파이프라인 (전문가급)
// 계획(pro) → 조사(flash × N, 검색 그라운딩) → 유료 데이터 결제 → 종합(pro, 딥은 2부 구성)
// → 레드팀 검증(pro) → 시각화 추출 → 리포트 저장
import { GoogleGenAI } from '@google/genai';
import { appendProgress, updateOrder, saveReport } from '../store.js';
import { pay } from './wallet.js';
import { officialDataAvailable, kosisLookup, dartFinancials } from './datasources.js';
import { classifyDomain, hostOf, renderSourcesSection, resolveSources, summarizeSources } from './sources.js';

const TIER_SPEC = {
  light: { subQuestions: 4, label: '라이트', verify: false, twoPart: false, minChars: 9000 },
  standard: { subQuestions: 7, label: '스탠다드', verify: true, twoPart: false, minChars: 16000 },
  deep: { subQuestions: 10, label: '딥', verify: true, twoPart: true, minChars: 13000 }, // 부당 하한 (2부 합산 26,000+)
};

const MODEL_FAST = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MODEL_PRO = () => process.env.GEMINI_MODEL_PRO || 'gemini-2.5-pro';

const ANALYST_RULES = `당신은 톱티어 전략컨설팅펌의 시니어 리서치 애널리스트다. 절대 규칙:
- 모든 수치에는 연도·맥락을 붙인다. 출처 간 수치가 상충하면 병기하고 차이를 설명한다.
- 사실(확인된 데이터) / 추정(계산·해석) / 전망(예측)을 구분해 서술한다.
- 일반론과 미사여구를 금지한다. 회사명·제품명·금액·날짜 등 구체 정보만 가치가 있다.
- 확인 불가한 내용은 "확인 필요"로 표시한다. 수치를 지어내지 않는다.`;

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다 (.env 참고)');
  const vertexai = process.env.GEMINI_USE_VERTEX === '1';
  return new GoogleGenAI({ vertexai, apiKey });
}

// 일시적 오류(429/5xx/네트워크)는 백오프 재시도
async function withRetry(fn) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      const transient = /429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|fetch failed|ECONNRESET|socket|timeout/i.test(msg);
      if (!transient || i === 2) throw e;
      await new Promise((r) => setTimeout(r, (i + 1) * 5000));
    }
  }
  throw lastErr;
}

function addUsage(costs, response) {
  const u = response.usageMetadata;
  if (u) costs.llmTokens += (u.promptTokenCount || 0) + (u.candidatesTokenCount || 0);
}

async function generate(ai, { model, prompt, useSearch, costs, maxTokens }) {
  const response = await withRetry(() => ai.models.generateContent({
    model: model || MODEL_FAST(),
    contents: prompt,
    config: {
      // urlContext 병용은 검색 그라운딩 폭을 크게 줄이는 회귀가 있어 제외 (2026-08-12 실측: 출처 50~130건 → 11건)
      ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
      ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
    },
  }));
  addUsage(costs, response);
  const sources = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  for (const c of chunks) {
    if (c.web?.uri) sources.push({ title: c.web.title || c.web.uri, uri: c.web.uri });
  }
  if (!response.text) throw new Error('모델 응답이 비어 있습니다');
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
    await appendProgress(id, `조사 시작 (${spec.label} 티어, 세부 질문 ${spec.subQuestions}개)`);

    // 1) 계획 (pro) — MECE 세부 질문
    const plan = await generate(ai, {
      model: MODEL_PRO(),
      costs,
      prompt: `${ANALYST_RULES}

다음 리서치 의뢰를 상호배타적·전체포괄(MECE)하게 커버하는 세부 질문 정확히 ${spec.subQuestions}개로 분해하라.
반드시 포함할 관점: 시장 규모·성장률(정량), 경쟁 구도·주요 사업자, 가격·수익 구조, 규제·리스크, 최신 동향(2024~2026), 고객·수요 측면.
번호 목록만 ${lang}로 출력하라.

의뢰 주제: ${topic}
${brief ? `클라이언트 요구사항: ${brief}` : ''}`,
    });
    const subQuestions = plan.text
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, spec.subQuestions);
    await appendProgress(id, `조사 계획 수립: ${subQuestions.length}개 세부 질문`);

    // 2) 조사 (flash × N, 검색 그라운딩)
    const findings = [];
    const allSources = [];
    for (let i = 0; i < subQuestions.length; i++) {
      const q = subQuestions[i];
      const r = await generate(ai, {
        costs,
        useSearch: true,
        prompt: `${ANALYST_RULES}

다음 질문을 최신 웹 정보로 철저히 조사하라. ${lang}로 400~700단어의 밀도 높은 사실 요약을 작성하라.
- 2024~2026년 최신 자료를 우선한다. 수치마다 연도를 명시한다.
- 구체적 기업명·제품명·금액·통계를 담는다.
- 통설과 반대되는 근거나 리스크 신호도 찾아 포함한다.

질문: ${q}`,
      });
      findings.push({ question: q, answer: r.text, sources: r.sources });
      allSources.push(...r.sources);
      await appendProgress(id, `세부 조사 ${i + 1}/${subQuestions.length} 완료 (출처 ${r.sources.length}건)`);
      await updateOrder(id, { costs });
    }

    // 2.5) 공식 원천 데이터 보강 — KOSIS(통계청)·DART(전자공시) API 키가 있을 때만
    let officialBlock = '';
    const avail = officialDataAvailable();
    if (avail.kosis || avail.dart) {
      try {
        const planRes = await generate(ai, {
          costs,
          prompt: `다음 리서치 주제와 조사 결과를 보고, 공식 원천 데이터로 보강할 대상을 JSON으로만 출력하라.
{"kosisKeywords":["국가통계포털에서 검색할 통계 키워드 최대 3개 (짧은 명사구)"],"dartCompanies":["재무제표를 조회할 한국 기업명 최대 3개 (정확한 상호)"]}
해당 없으면 빈 배열. JSON 외 출력 금지.

주제: ${topic}
조사 요약: ${findings.map((f) => f.question).join(' / ')}`,
        });
        const plan2 = JSON.parse(planRes.text.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const kosisKeywords = avail.kosis ? (plan2.kosisKeywords || []).slice(0, 3) : [];
        const dartCompanies = avail.dart ? (plan2.dartCompanies || []).slice(0, 3) : [];
        const results = await Promise.all([
          ...kosisKeywords.map((k) => kosisLookup(k)),
          ...dartCompanies.map((c) => dartFinancials(c)),
        ]);
        const hits = results.filter(Boolean);
        if (hits.length) {
          officialBlock = '\n\n## 공식 원천 데이터 (반드시 우선 사용하고 출처를 명시할 것)\n' + hits.map((h) => {
            allSources.push({ title: `${h.source} — ${h.table || h.corp}`, uri: h.url });
            const rows = (h.rows || []).slice(0, 25).map((r) =>
              h.corp ? `- ${r.account}: ${r.amount}${r.unit} (${h.year}년, 연결/별도 공시 기준)` : `- ${r.item} [${r.period}]: ${r.value}${r.unit}`
            ).join('\n');
            return `### ${h.source}: ${h.table || `${h.corp} 주요 재무 (${h.year})`}\n${rows}`;
          }).join('\n\n');
          await appendProgress(id, `공식 데이터 확보 — KOSIS ${kosisKeywords.length ? '조회' : '건너뜀'}, DART ${dartCompanies.length ? '조회' : '건너뜀'} (원천 ${hits.length}건)`);
        }
      } catch (e) {
        await appendProgress(id, `공식 데이터 보강 생략 (${e.message})`);
      }
    }

    // 3) 유료 데이터 결제 — 에이전트가 자기 지갑으로 직접 결제 (가드레일 내, 실패 시 무료 경로 폴백)
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

    // 4) 종합 (pro) — 딥은 2부 구성으로 분량·깊이 확보
    const findingsBlock = findings
      .map((f, i) => `## 조사 ${i + 1}: ${f.question}\n${f.answer}`)
      .join('\n\n');
    const baseCtx = `${ANALYST_RULES}

의뢰 주제: ${topic}
${brief ? `클라이언트 요구사항: ${brief}` : ''}

리서치팀 조사 결과:
${findingsBlock}${officialBlock}

작성 규칙: ${lang}, Markdown. 조사 결과에 없는 수치는 만들지 않는다. 비교·나열 데이터는 반드시 Markdown 표(|)로 정리한다. 문장은 단정적으로, 근거는 병기한다.
분량 규칙: 이 리포트는 유료 상품이다. 조사 결과에 담긴 사실·수치·사례를 최대한 활용해 각 소제목마다 3문단 이상으로 충실히 서술하라. 요약체로 축약하지 말고, 배경 맥락과 해석을 함께 담아라. 미사여구로 분량을 채우는 것은 금지한다.`;

    let body;
    if (spec.twoPart) {
      await appendProgress(id, '리포트 작성 1/2 (요약·시장 분석)');
      const partA = await generate(ai, {
        model: MODEL_PRO(),
        costs,
        maxTokens: 32768,
        prompt: `${baseCtx}

리포트 전반부를 작성하라. 이 부분 분량은 공백 포함 최소 ${spec.minChars.toLocaleString()}자 이상이어야 한다. 구성:
# (리포트 제목)
**3줄 핵심 요약** (의사결정자가 이것만 읽어도 되게)
## 요약 (Executive Summary) — 4~6문단
## 핵심 발견 사항 — 정량 수치 중심 불릿 7~10개
## 시장 개관과 구조 — 규모·성장률·세그먼트·밸류체인, 표 1개 이상 포함`,
      });
      await appendProgress(id, '리포트 작성 2/2 (심층 분석·권고)');
      const partB = await generate(ai, {
        model: MODEL_PRO(),
        costs,
        maxTokens: 32768,
        prompt: `${baseCtx}

리포트 전반부(이미 작성됨):
${partA.text.slice(0, 4000)}
…(중략)

이어지는 후반부를 작성하라. 전반부와 중복하지 말 것. 이 부분 분량은 공백 포함 최소 ${spec.minChars.toLocaleString()}자 이상이어야 한다. 구성:
## 심층 분석 — 주제별 소제목으로 나눠 구체적으로 (경쟁사·사업자 비교 표 포함)
## 리스크와 반론 — 낙관론에 대한 반대 근거 포함
## 시나리오 — 낙관/기본/비관 3개, 각 시나리오의 트리거 조건 명시
## 실행 권고 — 0~3개월 / 3~12개월로 나눠 우선순위와 함께
## 한계와 추가 조사 제안`,
      });
      body = `${partA.text}\n\n${partB.text}`;
    } else {
      const single = await generate(ai, {
        model: MODEL_PRO(),
        costs,
        maxTokens: 32768,
        prompt: `${baseCtx}

완결된 클라이언트 리포트를 작성하라. 본문 분량은 공백 포함 최소 ${spec.minChars.toLocaleString()}자 이상이어야 한다. 구성:
# (리포트 제목)
**3줄 핵심 요약**
## 요약 (Executive Summary)
## 핵심 발견 사항 — 정량 수치 중심 불릿
## 상세 분석 — 주제별 소제목, 비교 데이터는 표로
## 리스크와 반론
## 실행 권고 — 우선순위 포함
## 한계와 추가 조사 제안`,
      });
      body = single.text;
    }
    await updateOrder(id, { costs });

    // 5) 레드팀 검증 (pro) — 근거 없는 단정·수치 모순·구조 결함을 잡아 수정본 출력
    if (spec.verify) {
      await appendProgress(id, '품질 검증 (레드팀 리뷰)');
      const verified = await generate(ai, {
        model: MODEL_PRO(),
        costs,
        maxTokens: 32768,
        prompt: `${ANALYST_RULES}

아래는 조사 결과와 리포트 초안이다. 초안을 검증하고 수정하라:
1) 조사 결과에 근거가 없는 단정·수치 → 삭제하거나 "확인 필요" 표시
2) 수치 모순·단위 오류 → 조사 결과 기준으로 수정
3) 중복 문단 → 통합
4) 표·소제목 구조 유지, 분량은 유지하거나 보강 (절대 요약하지 말 것)
수정이 반영된 완성본 전체를 Markdown으로만 출력하라. 다른 말은 하지 마라.

[조사 결과]
${findingsBlock.slice(0, 30000)}

[리포트 초안]
${body}`,
      });
      if (verified.text.length > body.length * 0.7) body = verified.text; // 과도 요약 방어
      await updateOrder(id, { costs });
    }

    // 6) 시각화 데이터 추출 — 리포트에 등장한 수치만 사용 (창작 금지)
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
${body.slice(0, 40000)}`,
      });
      visuals = parseVisuals(vres.text);
      await appendProgress(id, `시각화 생성 — 핵심지표 ${visuals?.stats?.length || 0}개, 차트 ${visuals?.charts?.length || 0}개`);
    } catch (e) {
      await appendProgress(id, `시각화 추출 생략 (${e.message})`);
    }

    // 7) 리포트 저장
    const uniqueSources = [...new Map(allSources.map((s) => [s.uri, s])).values()];
    await appendProgress(id, '출처 정리 — 원문 링크·제목 확인 중');
    let sources;
    try {
      sources = await resolveSources(uniqueSources);
    } catch {
      sources = uniqueSources.map((source) => {
        const domain = hostOf(source.uri);
        return { ...source, domain, category: classifyDomain(domain) };
      });
    }
    const html = renderReport({ topic, tier: spec.label, body, sources, costs, payment, visuals });
    await saveReport(id, html);

    await updateOrder(id, { status: 'done', reportPath: `/reports/${id}.html`, costs });
    const summary = summarizeSources(sources);
    const credibility = [['공공', summary.public], ['연구', summary.research], ['언론', summary.news]]
      .filter(([, count]) => count).map(([label, count]) => `${label} ${count}`).join('·');
    await appendProgress(id, `리포트 완성 — 본문 ${body.length.toLocaleString()}자, 출처 ${sources.length}건${credibility ? `(${credibility})` : ''}, LLM 토큰 ${costs.llmTokens.toLocaleString()}개`);
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
.src-summary,.src-note{color:#64748b;font-size:.85rem}
.sources h4{margin:.9em 0 .3em}
.sources .dead{color:#475569}
.dom{color:#64748b;font-size:.8rem;margin-left:6px}
footer{margin-top:4em;color:#94a3b8;font-size:.85rem;border-top:1px solid #e2e8f0;padding-top:16px}
@media print{.viz,.chart{break-inside:avoid}}
</style></head><body>
<div class="meta">DeepDesk 리서치 리포트 · ${esc(tier)} 티어 · ${new Date().toISOString().slice(0, 10)}</div>
${bodyHtml}
${renderSourcesSection(sources)}
<footer>이 리포트는 DeepDesk AI 리서치 에이전트가 작성했습니다. 리서치 원가: LLM 토큰 ${costs.llmTokens.toLocaleString()}개 · 유료 데이터 $${costs.paidApiUsd.toFixed(2)}${payment?.explorerUrl ? ` (<a href="${esc(payment.explorerUrl)}" target="_blank" rel="noopener">에이전트 결제 트랜잭션 보기</a>)` : ''}</footer>
</body></html>`;
}

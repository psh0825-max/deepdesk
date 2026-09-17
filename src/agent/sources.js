export const sourceDeps = { fetch: globalThis.fetch }; // 테스트 주입용

export const CATEGORIES = [
  ['public', '공공·정부'],
  ['research', '연구·학술'],
  ['news', '언론'],
  ['org', '협회·기관'],
  ['other', '기업·기타'],
];

const PUBLIC_SUFFIXES = ['.go.kr', '.gov', '.gov.uk', '.gc.ca', '.gov.au', '.europa.eu'];
const PUBLIC_DOMAINS = ['korea.kr', 'kosis.kr', 'dart.fss.or.kr', 'opendart.fss.or.kr', 'data.go.kr', 'law.go.kr', 'bok.or.kr', 'kostat.go.kr', 'oecd.org', 'worldbank.org', 'imf.org', 'un.org', 'who.int', 'europa.eu', 'ecos.bok.or.kr'];
const RESEARCH_SUFFIXES = ['.re.kr', '.ac.kr', '.edu', '.ac.uk'];
const RESEARCH_DOMAINS = ['kdi.re.kr', 'kiet.re.kr', 'kiri.or.kr', 'kisdi.re.kr', 'stepi.re.kr', 'arxiv.org', 'ssrn.com', 'nature.com', 'science.org', 'sciencedirect.com', 'springer.com', 'wiley.com', 'jstor.org', 'ncbi.nlm.nih.gov', 'scholar.google', 'researchgate.net', 'dbpia.co.kr', 'riss.kr', 'kci.go.kr'];
const NEWS_DOMAINS = ['mk.co.kr', 'hankyung.com', 'chosun.com', 'joongang.co.kr', 'joins.com', 'donga.com', 'yna.co.kr', 'yonhapnews.co.kr', 'news1.kr', 'newsis.com', 'edaily.co.kr', 'mt.co.kr', 'sedaily.com', 'hani.co.kr', 'khan.co.kr', 'kbs.co.kr', 'imbc.com', 'sbs.co.kr', 'ytn.co.kr', 'jtbc.co.kr', 'mbn.co.kr', 'fnnews.com', 'asiae.co.kr', 'etnews.com', 'zdnet.co.kr', 'bloter.net', 'thebell.co.kr', 'biz.chosun.com', 'hankookilbo.com', 'kmib.co.kr', 'segye.com', 'munhwa.com', 'seoul.co.kr', 'ohmynews.com', 'pressian.com', 'nocutnews.co.kr', 'newspim.com', 'businesspost.co.kr', 'ajunews.com', 'dt.co.kr', 'ddaily.co.kr', 'inews24.com', 'reuters.com', 'bloomberg.com', 'nytimes.com', 'wsj.com', 'ft.com', 'cnbc.com', 'bbc.co.uk', 'bbc.com', 'theguardian.com', 'economist.com', 'apnews.com', 'techcrunch.com', 'theverge.com', 'wired.com', 'forbes.com', 'businessinsider.com', 'nikkei.com'];
const ORG_DOMAINS = ['korcham', 'kfme', 'kbiz', 'kita', 'fki'];

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function matchesDomain(host, domains) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function looksLikeDomain(value) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(String(value || '').trim());
}

function decodeHtml(value) {
  return String(value || '').replace(/&(amp|lt|gt|quot|nbsp);|&#(?:39|x27);/gi, (entity) => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ', '&#39;': "'", '&#x27;': "'",
  })[entity.toLowerCase()] || entity);
}

function titleFromHtml(html) {
  const match = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return match ? decodeHtml(match[1]).replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await sourceDeps.fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(response, maxBytes) {
  if (!response.body) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const remaining = maxBytes - total;
      chunks.push(chunk.slice(0, remaining));
      total += Math.min(chunk.byteLength, remaining);
      if (chunk.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function sourceFallback(source) {
  const domain = (isRedirectUri(source.uri) ? '' : hostOf(source.uri)) || (looksLikeDomain(source.title) ? String(source.title).toLowerCase() : '');
  return { ...source, domain, category: classifyDomain(domain) };
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function classifyDomain(host) {
  const normalized = String(host || '').toLowerCase().replace(/^www\./, '');
  if (PUBLIC_SUFFIXES.some((suffix) => normalized.endsWith(suffix)) || matchesDomain(normalized, PUBLIC_DOMAINS)) return 'public';
  if (RESEARCH_SUFFIXES.some((suffix) => normalized.endsWith(suffix)) || RESEARCH_DOMAINS.some((domain) => normalized.includes(domain))) return 'research';
  if (matchesDomain(normalized, NEWS_DOMAINS) || normalized.includes('news')) return 'news';
  if (normalized.endsWith('.or.kr') || normalized.endsWith('.org') || normalized.endsWith('.or.jp') || ORG_DOMAINS.some((domain) => normalized.includes(domain))) return 'org';
  return 'other';
}

export function isRedirectUri(uri) {
  return String(uri || '').includes('/grounding-api-redirect/');
}

async function resolveOne(source, { timeoutMs, maxBytes }) {
  if (!isRedirectUri(source.uri)) return sourceFallback(source);
  try {
    const redirect = await fetchWithTimeout(source.uri, { redirect: 'manual' }, timeoutMs);
    const location = redirect.headers?.get('location');
    if (![301, 302, 303, 307, 308].includes(redirect.status) || !location) {
      return { ...sourceFallback(source), dead: true };
    }
    const finalUrl = new URL(location, source.uri).href;
    const response = await fetchWithTimeout(finalUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; DeepDeskBot/1.0; +https://deepdesk-o5kintt6za-du.a.run.app)',
        accept: 'text/html',
      },
    }, timeoutMs);
    const contentType = response.headers?.get('content-type') || '';
    const pageTitle = contentType.toLowerCase().includes('text/html') ? titleFromHtml(await readBody(response, maxBytes)) : '';
    const domain = hostOf(finalUrl) || (looksLikeDomain(source.title) ? String(source.title).toLowerCase() : '');
    return { title: pageTitle || source.title, uri: finalUrl, domain, category: classifyDomain(domain) };
  } catch {
    return sourceFallback(source);
  }
}

export async function resolveSources(sources, { concurrency = 8, timeoutMs = 6000, maxBytes = 65536 } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const resolved = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), list.length) }, async () => {
    while (next < list.length) {
      const index = next++;
      resolved[index] = await resolveOne(list[index], { timeoutMs, maxBytes });
    }
  });
  await Promise.all(workers);
  return [...new Map(resolved.map((source) => [source.uri, source])).values()];
}

export function summarizeSources(sources) {
  const summary = { public: 0, research: 0, news: 0, org: 0, other: 0, total: 0 };
  for (const source of sources || []) {
    summary[source.category in summary ? source.category : 'other'] += 1;
    summary.total += 1;
  }
  return summary;
}

export function renderSourcesSection(sources) {
  const summary = summarizeSources(sources);
  const hasDeadSource = (sources || []).some((source) => source.dead);
  const parts = CATEGORIES.filter(([key]) => summary[key]).map(([key, label]) => `${label} ${summary[key]}`);
  const groups = CATEGORIES.map(([key, label]) => {
    const items = (sources || []).filter((source) => source.category === key);
    if (!items.length) return '';
    const liveItems = items.filter((source) => !source.dead);
    const deadByDomain = new Map();
    for (const source of items.filter((source) => source.dead)) {
      const domain = source.domain || hostOf(source.uri);
      deadByDomain.set(domain, (deadByDomain.get(domain) || 0) + 1);
    }
    const list = [
      ...liveItems.map((source) => {
      const title = source.title || source.domain || source.uri;
      const domain = source.domain || hostOf(source.uri);
      const suffix = title === domain ? '' : ` <span class="dom">${esc(domain)}</span>`;
      return `<li><a href="${esc(source.uri)}" target="_blank" rel="noopener">${esc(title)}</a>${suffix}</li>`;
      }),
      ...[...deadByDomain].map(([domain, count]) => {
        const prefix = count > 1 ? `${count}건 · ` : '';
        return `<li><span class="dead">${esc(domain)}</span> <span class="dom">${prefix}링크 만료</span></li>`;
      }),
    ].join('\n');
    return `<h4>${label} (${items.length})</h4><ul>${list}</ul>`;
  }).join('\n');
  const expiryNote = hasDeadSource ? ' 일부 링크는 검색 제공자의 보존 기간(약 30일)이 지나 만료되어 도메인만 표시합니다.' : '';
  return `<div class="sources" data-sources="v2">\n<strong>참고 출처 (${summary.total})</strong>\n<p class="src-summary">${parts.join(' · ')}</p>\n${groups}\n<p class="src-note">출처는 조사 시점의 웹 검색 결과이며 원문 링크로 연결됩니다. 수치와 인용은 원문에서 확인하시길 권합니다.${expiryNote}</p>\n</div>`;
}

function sourcesBlock(html) {
  return /<div\b[^>]*\bclass=(?:"[^"]*\bsources\b[^"]*"|'[^']*\bsources\b[^']*')[^>]*>[\s\S]*?<\/div>/i.exec(html);
}

export function parseSourcesSection(html) {
  const block = sourcesBlock(String(html || ''));
  if (!block) return [];
  const sources = [];
  const pattern = /<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of block[0].matchAll(pattern)) {
    sources.push({ title: decodeHtml(match[3].replace(/<[^>]*>/g, '')).trim(), uri: decodeHtml(match[1] || match[2]) });
  }
  return sources;
}

export function replaceSourcesSection(html, sectionHtml) {
  const block = sourcesBlock(String(html || ''));
  return block ? `${html.slice(0, block.index)}${sectionHtml}${html.slice(block.index + block[0].length)}` : html;
}

export function needsSourceEnrichment(html) {
  const block = sourcesBlock(String(html || ''));
  return Boolean(block && !/\bdata-sources\s*=\s*(?:"v2"|'v2')/i.test(block[0]) && block[0].includes('grounding-api-redirect'));
}

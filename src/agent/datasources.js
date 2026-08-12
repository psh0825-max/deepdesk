// 공식 원천 데이터 소스 — KOSIS(통계청)·DART(금감원 전자공시)
// API 키가 .env에 있을 때만 활성화되며, 실패는 조용히 건너뛴다 (파이프라인을 깨지 않음).
import zlib from 'node:zlib';

const KOSIS_KEY = () => process.env.KOSIS_API_KEY;
const DART_KEY = () => process.env.DART_API_KEY;

export function officialDataAvailable() {
  return { kosis: !!KOSIS_KEY(), dart: !!DART_KEY() };
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- KOSIS ----------
// 통계표 키워드 검색 → 상위 표의 최근 데이터 조회
export async function kosisLookup(keyword) {
  if (!KOSIS_KEY()) return null;
  try {
    const searchUrl = `https://kosis.kr/openapi/statisticsSearch.do?method=getList&apiKey=${KOSIS_KEY()}&format=json&jsonVD=Y&searchNm=${encodeURIComponent(keyword)}&startCount=1&resultCount=3`;
    const found = await getJson(searchUrl);
    const tables = Array.isArray(found) ? found : found?.list || [];
    if (!tables.length) return null;

    const t = tables[0];
    const dataUrl = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${KOSIS_KEY()}&format=json&jsonVD=Y&orgId=${t.ORG_ID}&tblId=${t.TBL_ID}&objL1=ALL&itmId=ALL&prdSe=Y&newEstPrdCnt=3`;
    let rows = [];
    try {
      const data = await getJson(dataUrl);
      rows = (Array.isArray(data) ? data : []).slice(0, 40);
    } catch { /* 일부 표는 파라미터 구조가 달라 조회 실패 — 표 메타만 사용 */ }

    return {
      source: 'KOSIS(국가통계포털)',
      table: t.TBL_NM,
      org: t.ORG_NM || t.ORG_ID,
      url: `https://kosis.kr/statHtml/statHtml.do?orgId=${t.ORG_ID}&tblId=${t.TBL_ID}`,
      rows: rows.map((r) => ({
        item: [r.C1_NM, r.C2_NM, r.ITM_NM].filter(Boolean).join(' · '),
        period: r.PRD_DE,
        value: r.DT,
        unit: r.UNIT_NM || '',
      })),
    };
  } catch (e) {
    console.error('kosis lookup failed:', keyword, e.message);
    return null;
  }
}

// ---------- DART ----------
// 기업코드 매핑(zip, 최초 1회 캐시) → 최근 사업연도 주요 재무계정
let corpMapPromise = null;

// 의존성 없는 최소 ZIP 해제 (단일 deflate 엔트리 — DART corpCode.zip 전용)
function unzipSingleEntry(buf) {
  // End of Central Directory 탐색
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  // Central Directory 첫 엔트리에서 로컬 헤더 위치
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('bad central directory');
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  // 로컬 헤더 파싱
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + compSize);
  return method === 8 ? zlib.inflateRawSync(data) : data;
}

async function corpMap() {
  if (!corpMapPromise) {
    corpMapPromise = (async () => {
      const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_KEY()}`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`corpCode HTTP ${res.status}`);
      const xml = unzipSingleEntry(Buffer.from(await res.arrayBuffer())).toString('utf8');
      // 상장사(stock_code 있는 곳) 우선의 이름→코드 맵
      const map = new Map();
      const re = /<list>\s*<corp_code>(\d+)<\/corp_code>\s*<corp_name>([^<]+)<\/corp_name>[\s\S]*?<stock_code>([^<]*)<\/stock_code>/g;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const [, code, name, stock] = m;
        const key = name.trim();
        const listed = stock.trim().length === 6;
        if (!map.has(key) || listed) map.set(key, { code, listed });
      }
      return map;
    })().catch((e) => { corpMapPromise = null; throw e; });
  }
  return corpMapPromise;
}

export async function dartFinancials(corpName) {
  if (!DART_KEY()) return null;
  try {
    const map = await corpMap();
    // 정확 일치 → 포함 일치 (상장사 우선)
    let hit = map.get(corpName);
    if (!hit) {
      const candidates = [...map.entries()].filter(([n]) => n.includes(corpName));
      candidates.sort((a, b) => (b[1].listed ? 1 : 0) - (a[1].listed ? 1 : 0) || a[0].length - b[0].length);
      if (candidates.length) { corpName = candidates[0][0]; hit = candidates[0][1]; }
    }
    if (!hit) return null;

    const year = new Date().getFullYear() - 1; // 최근 확정 사업연도
    for (const y of [year, year - 1]) {
      const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${DART_KEY()}&corp_code=${hit.code}&bsns_year=${y}&reprt_code=11011`;
      const data = await getJson(url);
      if (data.status !== '000' || !data.list?.length) continue;
      const cfs = data.list.filter((r) => r.fs_div === 'CFS');
      const rows = (cfs.length ? cfs : data.list)
        .filter((r) => /매출액|영업이익|당기순이익|자산총계|부채총계|자본총계/.test(r.account_nm))
        .map((r) => ({ account: r.account_nm, amount: r.thstrm_amount, unit: '원' }));
      if (rows.length) {
        return {
          source: 'DART(금융감독원 전자공시)',
          corp: corpName,
          year: y,
          url: `https://dart.fss.or.kr/`,
          rows,
        };
      }
    }
    return null;
  } catch (e) {
    console.error('dart lookup failed:', corpName, e.message);
    return null;
  }
}

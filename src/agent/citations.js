// Gemini 그라운딩 위치는 JS 문자 위치가 아니라 UTF-8 바이트 위치다.
export function sliceUtf8(text, startByte, endByte) {
  return Buffer.from(String(text ?? '')).subarray(startByte, endByte).toString();
}

function charPosOfByte(text, byteOffset) {
  if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset > Buffer.byteLength(text)) return -1;
  return Buffer.from(text).subarray(0, byteOffset).toString().length;
}

export function annotateWithSupports(text, supports, chunkIdToSourceId) {
  let annotated = String(text ?? '');
  if (!Array.isArray(supports) || typeof chunkIdToSourceId !== 'function') return annotated;
  const seen = new Set();
  const ordered = [...supports].sort((a, b) => (b?.segment?.endIndex ?? -1) - (a?.segment?.endIndex ?? -1));

  for (const support of ordered) {
    try {
      const segment = support?.segment;
      const startByte = segment?.startIndex;
      const endByte = segment?.endIndex;
      if (!Number.isInteger(startByte) || !Number.isInteger(endByte) || startByte < 0 || endByte <= startByte) continue;
      const ids = [...new Set((support?.groundingChunkIndices || [])
        .map((index) => chunkIdToSourceId(index))
        .filter((id) => Number.isInteger(id) && id > 0))].slice(0, 3);
      if (!ids.length) continue;

      const charStart = charPosOfByte(annotated, startByte);
      let foundAt = -1;
      let foundText = typeof segment.text === 'string' ? segment.text : '';
      if (foundText && charStart >= 0) foundAt = annotated.indexOf(foundText, Math.max(0, charStart - 20));
      if (foundAt < 0) {
        foundText = sliceUtf8(annotated, startByte, endByte);
        if (!foundText) continue;
        foundAt = charStart;
        if (foundAt < 0 || annotated.slice(foundAt, foundAt + foundText.length) !== foundText) continue;
      }

      const insertAt = foundAt + foundText.length;
      const markers = ids.map((id) => `[S${id}]`).join('');
      const markerKey = `${insertAt}:${markers}`;
      if (seen.has(markerKey)) continue;
      seen.add(markerKey);
      annotated = `${annotated.slice(0, insertAt)} ${markers}${annotated.slice(insertAt)}`;
    } catch {
      // 일부 그라운딩 메타데이터가 불완전해도 본문 생성은 계속한다.
    }
  }
  return annotated;
}

export function extractCitedIds(markdown) {
  const ids = [];
  const seen = new Set();
  for (const match of String(markdown ?? '').matchAll(/\[S(\d+)\]/g)) {
    const id = Number(match[1]);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function numberCitations(markdown, validIds) {
  const valid = validIds instanceof Set ? validIds : new Set(validIds || []);
  const order = [];
  const positions = new Map();
  const body = String(markdown ?? '').replace(/\[S(\d+)\]/g, (_match, rawId) => {
    const id = Number(rawId);
    if (!valid.has(id)) return '';
    if (!positions.has(id)) {
      positions.set(id, order.length + 1);
      order.push(id);
    }
    return `⟦C${positions.get(id)}⟧`;
  }).replace(/(?:⟦C\d+⟧)(?:[\s,]+⟦C\d+⟧)+/g, (run) => run.replace(/[\s,]+/g, ''));
  return { body, order };
}

export function renderCitationPlaceholders(html) {
  return String(html ?? '').replace(/⟦C(\d+)⟧/g, (_match, number) =>
    `<sup class="cite"><a href="#src-${number}">${number}</a></sup>`);
}

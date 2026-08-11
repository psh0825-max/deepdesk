// Gemini API 키 진단: Vertex/Gemini 두 모드로 최소 호출 테스트
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../node_modules/@google/genai/package.json', import.meta.url), 'utf8'));
console.log('SDK version:', pkg.version);
const key = process.env.GEMINI_API_KEY;
console.log('key prefix:', key ? key.slice(0, 6) : 'MISSING', 'len:', key?.length);

for (const vertexai of [true, false]) {
  try {
    const ai = new GoogleGenAI({ vertexai, apiKey: key });
    const r = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Reply with exactly: OK' });
    console.log(vertexai ? 'VERTEX ' : 'GEMINI ', 'OK ->', r.text?.trim());
  } catch (e) {
    console.log(vertexai ? 'VERTEX ' : 'GEMINI ', 'FAIL ->', String(e.message || e).slice(0, 300));
  }
}

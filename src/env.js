// .env 로더 — 파일 값이 기존(상속된) 환경변수보다 우선한다.
// 로컬 개발 결정성 확보용: OS에 남은 옛 GEMINI_API_KEY 등이 서버를 오염시키지 않게 함.
// 배포(Cloud Run)에는 .env가 없으므로 런타임 환경변수가 그대로 쓰인다.
import { readFileSync } from 'node:fs';

try {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // .env 없음 — 런타임 환경변수 사용
}

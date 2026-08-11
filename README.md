# DeepDesk — 스스로 결제하는 AI 리서치 데스크

**AI research desk that pays its own way.**

주제를 의뢰하면 Gemini 기반 리서치 에이전트가 조사 계획을 세우고, 웹을 검색·교차검증하며, 필요한 유료 데이터는 **에이전트 자신의 USDC 지갑으로 직접 결제**(지출 한도·허용목록·일일 상한 가드레일 내에서)한 뒤, 전문가급 리포트를 이메일로 발송하는 **AI 운영 리서치 비즈니스**입니다.

> Build with Gemini XPRIZE 출품작 · 카테고리: Money & Financial Access · $50K Agentic Economy Prize (Circle) 도전

## 아키텍처

- **에이전트**: Gemini API (`@google/genai`) — 계획 → Google 검색 그라운딩 조사 → 종합 리포트
- **에이전트 지갑**: Circle Developer-Controlled Wallets, USDC (테스트넷 → 프로덕션). `src/agent/wallet.js`의 가드레일(1회/주문당/일일 한도, 서비스 허용목록)을 통과한 결제만 실행
- **인프라**: Google Cloud Run + (예정) Firestore
- **수금**: 토스 / PayPal / USDC (에이전트 지갑으로 직접 수금)

## 실행

```bash
npm install
copy .env.example .env   # GEMINI_API_KEY, ADMIN_TOKEN 채우기
npm start                # http://localhost:8080
```

주문 실행(입금 확인 후):

```bash
curl -X POST http://localhost:8080/api/admin/orders/<주문ID>/run -H "x-admin-token: $ADMIN_TOKEN"
```

## 단위 경제 (리포트 1건당)

| 항목 | 값 |
|---|---|
| 판매가 | ₩9,900 ~ ₩59,000 |
| LLM 원가 | 리포트에 토큰 사용량 자동 기록 |
| 유료 데이터 | 에이전트 지갑 원장(`data/ledger.json`)에 건별 기록 |

모든 리포트 하단에 해당 건의 원가가 투명하게 표기됩니다 — 에이전트가 돈을 어떻게 썼는지 고객도 봅니다.

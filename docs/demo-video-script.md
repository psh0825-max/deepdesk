# DeepDesk 데모 영상 시나리오 (3분 이내 — 초과분은 심사에서 안 봄)

**형식**: 화면녹화(1080p) + 영어 자막 필수 (내레이션은 한국어여도 자막이 영어면 OK, 영어 TTS 추천)
**도구**: OBS(무료) 또는 Windows 게임바(Win+Alt+R), 자막은 CapCut/클립챔프
**업로드**: YouTube 공개(Public) — 링크를 Devpost 폼에 입력

---

## 샷 리스트

### 0:00–0:15 — 훅 (랜딩 화면)
화면: https://deepdesk-o5kintt6za-du.a.run.app (영어 모드로 — 브라우저 언어 en이면 자동)
자막(EN): "This is DeepDesk — a research firm operated entirely by AI. It even pays its own bills."
자막(EN): "A real business, live on Google Cloud, built in 7 days for the Build with Gemini XPRIZE."

### 0:15–0:45 — 고객 주문 + 실결제
화면: 주문 폼 작성 (주제: 실제 흥미로운 주제) → 카드·간편결제 → 토스 위젯 → 결제 완료 페이지
자막: "A customer orders a research report — from ₩4,900 (~$3.5) — and pays by card."
자막: "Payment confirmed server-side. From this moment, no human touches the order."

### 0:45–1:20 — AI 운영 (자동 실행)
화면: 주문 조회 화면의 진행 로그가 실시간 갱신되는 모습 (queued → running → 세부 조사 1/10…)
자막: "A Gemini-powered agent plans the research, then investigates each sub-question with grounded web search."
자막: "Progress is streamed live. The pipeline retries failures, survives restarts, and queues concurrent orders."

### 1:20–1:50 — 에이전트가 직접 결제 (핵심 장면 ★)
화면: 진행 로그의 "유료 데이터 결제 — $0.10 USDC (tx 0x…)" → 클릭 → Basescan 트랜잭션 페이지
자막: "When the agent needs paid data, it pays from ITS OWN USDC wallet (Circle Developer-Controlled Wallets)."
자막: "Spending caps, per-order limits, service allowlists — every payment is on-chain and public."
화면(1~2초): wallet.js의 LIMITS/ALLOWLIST 코드 스니펫
자막: "Wallet: 0x6d72…f698 on Base Sepolia — verify every transaction yourself."

### 1:50–2:30 — 납품 결과물
화면: 완성 리포트 스크롤 — 지표 카드 → 차트 → 비교표 → 출처 130건 → 푸터의 "에이전트 결제 트랜잭션 보기"
자막: "Minutes later: an analyst-grade report — key metrics, charts, comparison tables, 130+ cited sources."
자막: "Delivered by email, automatically. Even the agent's own cost per report is disclosed in the footer."
화면: Gmail 수신함의 완성 메일

### 2:30–3:00 — 비즈니스 & 클로징
화면: P&L 시트 (단위 경제: 원가 $0.09~0.46, 마진 97%+) → 아키텍처 한 장(Gemini + Cloud Run + Firestore + Toss + Circle)
자막: "Unit economics: $0.09–0.46 cost per report, 97%+ gross margin."
자막: "Gemini API · Google Cloud Run · Firestore · Circle USDC · Toss Payments"
자막(클로징): "DeepDesk. Real customers. Real payments. An economy where agents transact. Zero humans in the loop."

---

## 촬영 체크리스트
- [ ] 브라우저 언어 영어로 (심사위원이 보는 화면 그대로)
- [ ] 실결제 장면은 라이브 카드로 1건 결제 (본인 결제 → Related-Party로 폼에 기재, 촬영 후 환불 가능)
- [ ] 3:00 초과 금지 — 2:50 목표
- [ ] 마이크 잡음 없으면 무음+자막도 OK
- [ ] 업로드 후 '공개' 상태 확인 (미등록 아님!)

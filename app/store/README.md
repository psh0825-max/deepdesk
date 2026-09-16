# 스토어 자산 (Google Play / App Store)

모든 자산은 코드에서 재생성한다. 목업 없음 — 스크린샷은 실제 Flutter 위젯을 엔진으로 렌더링한 것.

## 산출물 (`store/out/`)
- `icon-1024.png`, `icon-512.png` — 스토어 아이콘. `icon-foreground.png`(알파) — Android 적응형 아이콘 전경
- `feature-1024x500.png` — Play 그래픽 이미지
- `screenshots/ko|en/*.png` 1080×2160 (휴대전화), `screenshots/tablet7/ko|en/*.png` 1200×1920, `screenshots/tablet10/ko|en/*.png` 1600×2560, `screenshots/iphone69/ko|en/*.png` 1320×2868, `screenshots/iphone65/ko/*.png` 1242×2688
- 각 폴더는 7장: `01_home` 히어로 · `02_pricing` 요금제 · `03_order` 주문/결제 요약 · `04_progress` 진행 · `05_done` 완료 · `06_reports` 내 리포트 · `07_settings` 설정
- `iap-review/deepdesk_{light,standard,deep}.png` — App Store 인앱 상품 심사용(= iphone69/ko/02_pricing)

## 재생성
```bash
# 1) 브랜드 PNG (헤드리스 크롬, 의존성 0)
node store/render.mjs

# 2) 런처 아이콘 (android mipmap/adaptive + ios AppIcon)
dart run flutter_launcher_icons

# 3) 스크린샷 — 먼저 폰트를 받아 둔다 (gitignore, 32MB)
#    https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf
#    https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf
#    → test/store/fonts/
flutter test --dart-define=STORE_SHOTS=1 --update-goldens test/store/store_screenshots_test.dart
```
`STORE_SHOTS`가 없으면 이 테스트는 건너뛰므로 일반 `flutter test`에 영향 없다.

## 등록정보 문구
`listing.ko-KR.md`, `listing.en-US.md` — Play Console에 2026-09-15 입력 완료(기본 ko-KR + en-US 번역).

## 규칙
- USDC/암호화폐/지갑/결제수단 문구 금지 (Apple 3.1.5, Play 금융 정책)
- 가격은 앱이 스토어에서 받아 표시하므로 스크린샷의 가격도 콘솔 값(4,900/14,900/29,900)과 맞춘다

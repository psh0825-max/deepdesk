# DeepDesk 스토어 출시 체크리스트

릴리스 전에는 아래 순서대로 확인한다. 앱 식별자는 Android/iOS 모두 `com.lightonpluslab.deepdesk`이고, 현재 버전은 [`app/pubspec.yaml`](../app/pubspec.yaml)의 `1.0.0+1`이다.

## 0. 코드에서 끝난 것 (한눈에)

| 구분 | 상태 | 확인할 것 |
| --- | --- | --- |
| 서버 | 완료 | Cloud Run `deepdesk`에 `POST /api/iap/confirm`, `GET /api/config`의 `iap.products`가 있다. |
| 앱 | 완료 | 스토어 IAP만 사용한다. 카드·PayPal·Toss와 USDC·암호화폐·지갑 문구는 넣지 않는다. |
| 테스트 | 실행 | 서버는 `npm test`, Android는 `flutter build appbundle --release`로 확인한다. |
| 미완 | 인지 | 환불 웹훅, 계정 기반 주문 이력, 영문 진행 메시지는 아직 없다. |

## 1. 서버 배포 (한 번)

1. 서버 변경을 커밋한다. `app/`, `test/`는 `.gcloudignore`로 배포 원본에서 제외된다.
2. 저장소 루트에서 배포한다.

   ```bash
   gcloud run deploy deepdesk --source . --region asia-northeast3 --project deepdesk-xprize
   ```

3. Songbit 서비스에서 Play 서비스 계정 값을 Cloud Run끼리 복사한다. 값을 채팅·파일·Git에 붙여 넣지 않는다.

   ```bash
   V=$(gcloud run services describe songbit --project=songbit-app --region=asia-northeast3 --format='value(spec.template.spec.containers[0].env[name=GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64].value)')
   gcloud run services update deepdesk --project=deepdesk-xprize --region=asia-northeast3 --update-env-vars "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64=$V"
   ```

4. 설정을 확인한다.

   ```bash
   curl https://deepdesk-o5kintt6za-du.a.run.app/api/config | jq .iap
   ```

5. `ANDROID_PACKAGE_NAME`, `APPLE_BUNDLE_ID`는 기본값 `com.lightonpluslab.deepdesk`를 쓴다. `APPLE_SHARED_SECRET`은 소모성 상품 검증에는 선택 사항이다.
6. 비용 절감을 위해 Cloud Run `min-instances=0`을 유지한다. 앱의 45초 타임아웃은 5~15초 콜드 스타트를 허용하므로 1로 되돌리지 않는다.

## 2. Google Play Console

### 업로드는 클릭 한 번
`app\publish-internal.cmd` 더블클릭 → 릴리스 AAB 빌드 → Play Developer API 로 internal 트랙 업로드·검증·커밋. 릴리스 노트는 `app\play-notes\<locale>.txt`.
- **앱이 Play Console 에 먼저 만들어져 있어야 한다** (아래 2-1). 없으면 `HTTP 404 Package not found` 로 멈춘다.
- 서비스계정(`play-store-publisher@momoi-486213`)에 이 앱 권한이 없으면 `HTTP 403` → 사용자 및 권한에서 앱 추가 후 다시 더블클릭.
- 같은 빌드번호를 두 번 올리면 "버전코드 이미 사용" → `app/pubspec.yaml` 의 `+N` 을 올린다. 터미널에서 `--dry-run` 을 붙이면 발행 없이 검증만.
- 서명키 `app/android/app/deepdesk-upload.jks` + `app/android/key.properties` 는 2026-09-15 생성됨(gitignore). **백업 필수** — 잃으면 Play App Signing 에서 업로드 키 재설정 절차를 밟아야 한다.


1. 패키지 이름 `com.lightonpluslab.deepdesk`로 앱을 만든다.
2. **인앱 상품 → 소모성 상품**에 아래 세 상품을 정확히 같은 ID로 만든다. 콘솔 가격이 앱 가격의 기준이다.

   | 상품 ID | 표시 가격 |
   | --- | ---: |
   | `deepdesk_light` | ₩4,900 |
   | `deepdesk_standard` | ₩14,900 |
   | `deepdesk_deep` | ₩29,900 |

3. **사용자 및 권한**에서 `play-store-publisher@momoi-486213.iam.gserviceaccount.com`에 DeepDesk 앱 접근을 부여하고, **재무 데이터 보기**와 **주문 관리**를 켠다. `publishBundle` 발행 키는 별도 보관하고 절대 커밋하지 않는다.
4. **앱 콘텐츠**를 작성한다.
   - 개인정보처리방침: `https://deepdesk-o5kintt6za-du.a.run.app/privacy.html`
   - 수집 데이터: 보고서 전송용 이메일, 리서치 주제/브리프
   - 광고 없음, 추적 없음, 분석 SDK 없음으로 답한다.
   - 콘텐츠 등급 설문도 완료한다.
5. 스토어 등록정보와 스크린샷을 작성한다. USDC·암호화폐·지갑 등 암호화폐 관련 문구를 어디에도 넣지 않는다.
6. 업로드 키와 `key.properties` 서명 설정을 준비한다. 키는 한 번만 생성해 안전하게 보관한다.

   ```bash
   keytool -genkeypair -v -keystore deepdesk-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

7. 빌드하고 내부 테스트 트랙에 올린다.

   ```bash
   cd app
   flutter build appbundle --release
   ```

8. 라이선스 테스터를 추가하고 실기기에서 구매한다. 구매 뒤 보고서가 앱과 이메일에 도착하는지 확인한다.
9. 서버 로그에서 `reason=paid`를 확인한 뒤 프로덕션 출시를 진행한다.

   ```bash
   gcloud logging read 'resource.labels.service_name="deepdesk" AND textPayload:"iap confirm"' --project deepdesk-xprize --limit 20 --freshness 1d
   ```

## 3. App Store Connect (맥에서)

코드 쪽은 끝났다(2026-09-15): iPhone 전용(`TARGETED_DEVICE_FAMILY = 1`), iOS 15+, 팀 `237X7RZB63`, 번들 `com.lightonpluslab.deepdesk`, 개인정보 매니페스트 연결, `ITSAppUsesNonExemptEncryption=false`.
붙일 문안은 전부 `app/store/appstore.ko-KR.md`, `app/store/appstore.en-US.md`에 있고, 스크린샷은 `app/store/out/screenshots/iphone69/{ko,en}/`(1320×2868)·`iphone65/ko/`(1242×2688), 인앱 심사용 이미지는 `app/store/out/iap-review/*.png`다.

### 3-1. ASC 웹에서 (윈도우에서도 가능)
1. **앱 만들기** — 플랫폼 iOS, 이름 `DeepDesk`(전 세계 유일해야 함; 막히면 `DeepDesk AI Research`, 코드 무관), 기본 언어 한국어, 번들 ID `com.lightonpluslab.deepdesk`(없으면 Certificates → Identifiers에서 먼저 등록, In-App Purchase 기본 포함), SKU `deepdesk-ios`, 사용자 액세스 전체.
2. **앱 정보** — 카테고리 비즈니스(보조 생산성), 개인정보 처리방침 URL `https://deepdesk-o5kintt6za-du.a.run.app/privacy.html`, 콘텐츠 권한 "타사 콘텐츠 없음".
3. **가격 및 사용 가능 여부** — 무료, 모든 국가.
4. **인앱 구입** → 소모성 3개. 참조 이름/제품 ID/표시 이름/설명은 `appstore.ko-KR.md`의 표 그대로(en-US 현지화도 추가). 가격은 ₩4,900·14,900·29,900에 **가장 가까운 가격 등급**(Apple 가격점은 900원 단위가 없을 수 있음 — 앱은 스토어 가격을 그대로 표시하므로 코드 수정 불필요). 각 상품에 **심사용 스크린샷** `iap-review/<제품ID>.png` 필수 — 이게 없으면 상품이 "메타데이터 누락"으로 심사에 안 들어간다.
5. **앱 개인정보** — 데이터 수집 예: 이메일 주소(앱 기능), 구매 내역(앱 기능), 기타 사용자 콘텐츠=조사 주제(앱 기능). 전부 "사용자와 연결됨", "추적에 사용 안 함". 그 외 수집 없음.
6. **연령 등급** — 설문 전부 "없음" → 4+. (Play는 온라인 콘텐츠 사유로 브라질만 14+였다.)
7. **버전 1.0** — 스크린샷 6.9″ 슬롯에 `iphone69/ko` 5장(`01_order_tiers`는 `01_order_top`과 동일하니 하나만), 6.5″ 슬롯에 `iphone65/ko` 5장. en-US 현지화 추가 후 `iphone69/en`. 프로모션 텍스트·설명·키워드·지원 URL·마케팅 URL은 문안 파일에서 복사. 저작권 `2026 LightOn Plus Lab`.
8. **App Review 정보** — 로그인 필요 없음(체크 해제), 연락처 이름/전화/이메일, 메모에 문안 파일의 "심사 노트(영문)" 전문. 첨부 없음.
9. **버전 출시** — "수동 출시"로 두면 승인 뒤 원할 때 출시.

### 3-2. 맥에서 (빌드·업로드·검증)
```bash
git pull
cd app && flutter pub get
cd ios && pod install && cd ..
bash ios/verify-release.sh          # 정적 검사 + 서버 /api/config 확인, 전부 PASS여야 함
flutter build ipa --release         # build/ios/ipa/deepdesk_app.ipa
```
- 처음이면 Xcode → Runner 타겟 → Signing & Capabilities에서 팀 `237X7RZB63` 자동 서명 확인. 별도 Capability 추가 불필요(로그인 없음, 푸시 없음).
- **Transporter**(Mac App Store)로 `.ipa` 업로드 → ASC 버전 1.0에서 빌드 선택.
- **TestFlight** 내부 테스터로 설치 → 설정 → App Store → Sandbox 계정 로그인 → 앱에서 라이트 구매 → 진행 화면 진입 확인 → 서버 로그:
  ```bash
  gcloud logging read 'resource.labels.service_name="deepdesk" AND textPayload:"iap confirm"' --project deepdesk-xprize --limit 10 --freshness 1h
  ```
  `platform=ios reason=paid`면 전 구간 통과. `reason=rejected`에 status 21002면 영수증 형식(StoreKit 2 JWS를 보낸 것 — 앱은 `in_app_purchase_storekit` 기본이라 Songbit처럼 `enableStoreKit1()`가 필요할 수 있다), 21004면 공유 암호 불일치(소모성엔 없어도 됨).
- 심사 제출. 최초 심사는 보통 1~3일.

### 3-3. Apple 심사에서 걸리기 쉬운 것 (이 앱 기준)
- **2.1 앱 완성도** — 심사원이 실제로 결제해 리포트를 봐야 한다. Sandbox 구매도 실제 조사를 돌리므로 5~30분 뒤 리포트가 뜬다. 심사 노트에 이미 써 있다.
- **3.1.1 인앱 구입** — 리포트는 IAP로만. 외부 결제 링크·가격 언급 없음(확인됨).
- **3.1.5 암호화폐** — 앱·문안·스크린샷에 지갑/USDC 문구 없음(확인됨). 서버 진행 로그의 USDC 줄은 앱이 필터.
- **5.1.1 데이터 수집** — 이메일 입력란 아래 "리포트를 이 주소로 보내드립니다" 사유 표시(확인됨). 계정 없음 → Sign in with Apple·계정 삭제 요건 해당 없음.
- **4.2 최소 기능** — 웹 래퍼 아님. 네이티브 5화면(주문·진행·리포트·기록·정보).
- **1.2 사용자/AI 생성 콘텐츠** — 리포트 끝에 전체 출처 목록, 앱에 "문제 신고"(support@ 메일) 있음. 심사 노트에 명시.
- **5.1.2 데이터 사용** — 앱 개인정보 라벨과 실제 수집(이메일·구매·주제)이 일치해야 한다. 위 5번 그대로.

## 4. 심사에서 걸리기 쉬운 것

- **Apple 4.2 / Play 최소 기능**: 결제 뒤 실제 리서치와 보고서 표시·이메일 전송까지 실기기에서 보여 준다. 단순 결제 화면으로 제출하지 않는다.
- **Apple 3.1.1 / Play 결제 정책**: 디지털 리서치 구매는 스토어 IAP만 쓴다. 카드·PayPal·Toss 결제 UI나 외부 결제 유도는 금지한다.
- **Apple 3.1.5 / Play 금융 정책**: 앱·스크린샷·설명·심사 메모에 USDC·암호화폐·지갑 문구를 넣지 않는다.
- **Apple 5.1.1 / Play Data safety**: 이메일과 리서치 주제/브리프 수집을 빠뜨리지 말고, 광고·추적·분석 SDK가 없음을 일관되게 답한다.
- **Apple 2.1 / Play 앱 액세스·테스트**: 로그인은 필요 없다고 쓰고, 테스트 구매가 실제 실행됨과 5~30분 대기 시간을 심사 메모에 명확히 알린다.

## 5. 출시 후 점검

1. iOS 릴리스 전에는 [`app/ios/verify-release.sh`](../app/ios/verify-release.sh)를 실행한다.
2. 매 스토어 구매 뒤 아래 로그를 확인한다.

   ```bash
   gcloud logging read 'resource.labels.service_name="deepdesk" AND textPayload:"iap confirm"' --project deepdesk-xprize --limit 20 --freshness 1d
   ```

3. `reason=paid`면 성공이다. `reason=not_configured`면 Play 서비스 계정 환경 변수가 없고, iOS `reason=rejected`의 `21002`는 영수증 손상, `21004`는 공유 보안 문자열 불일치다.
4. Cloud Run `min-instances=0`과 앱 45초 타임아웃을 유지한다.

## 6. 아직 안 된 것 / 리스크

- Play RTDN과 App Store Server Notifications 환불 웹훅이 없다. 환불된 주문도 실행될 수 있다.
- 주문 이력은 계정이 아닌 기기별이다. 재설치하면 목록은 사라지지만 이메일 링크는 계속 쓸 수 있다.
- 서버 진행 메시지는 한국어만 제공한다.
- 속도 제한은 IP당 시간당 10회이며, 주문 생성과 IAP 확인이 같은 한도를 공유한다.

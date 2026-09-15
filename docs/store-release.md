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

1. 앱 이름 `DeepDesk`의 전역 사용 가능 여부를 확인한다. 이미 있으면 `DeepDesk AI Research`를 쓴다. 코드 변경은 필요 없다.
2. Apple Developer에서 번들 ID `com.lightonpluslab.deepdesk`, 팀 `237X7RZB63`을 확인한다. 최소 iOS는 15.0이다.
3. **소모성 인앱 구입**에 `deepdesk_light`, `deepdesk_standard`, `deepdesk_deep`를 만든다. 각 상품의 심사용 스크린샷을 반드시 넣는다. 한국 가격점에 ₩4,900이 없으면 가장 가까운 가격점을 고른다.
4. 앱 개인정보 라벨에는 이메일과 리서치 주제/브리프만 선언한다. 광고·추적·분석 SDK는 없다고 답한다. 로그인 기능이 없으므로 Sign in with Apple 및 계정 삭제 항목은 해당하지 않는다.
5. 심사 정보에 아래 영문 메모를 넣는다.

   ```text
   No login is required. After purchase, research runs for 5–30 minutes and the report appears in the app and is also delivered by email.
   Sandbox/test purchases trigger a real run; the server retries Apple sandbox receipts on status 21007, so reviewers can see a real report. Each test run has a small Gemini cost.
   ```

6. 맥에서 빌드하고 업로드한다.

   ```bash
   cd app
   flutter build ipa --release
   bash ios/verify-release.sh
   ```

7. TestFlight와 샌드박스 계정으로 각 소모성 상품을 결제한다. 실제 리서치 실행과 이메일 도착을 확인하고 서버 로그에서 `reason=paid`를 확인한다.
8. 개인정보처리방침 URL과 이용약관 URL, 지원 이메일을 입력한 뒤 제출한다.
   - 개인정보처리방침: `https://deepdesk-o5kintt6za-du.a.run.app/privacy.html`
   - 이용약관: `https://deepdesk-o5kintt6za-du.a.run.app/terms.html`
   - 지원: `support@lightonpluslab.com`

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

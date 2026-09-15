# DeepDesk 앱

실행: `flutter run --dart-define=DEEPDESK_BASE_URL=https://deepdesk-o5kintt6za-du.a.run.app`

빌드: `flutter build appbundle --release`, macOS에서는 `flutter build ipa --release`.

스토어 상품 ID는 `lib/core/config.dart`의 기본값과 서버 `/api/config`의 `iap.products`에 있습니다.

스토어 정책: 결제는 `in_app_purchase`만 사용합니다. 표시 가격은 스토어 상품 가격만 사용합니다. 외부 결제 화면이나 링크를 제공하지 않습니다. 이메일은 리포트 발송 목적으로만 요청합니다. 서버 진행 메시지 중 금지된 결제 관련 문구는 표시하지 않습니다.

## 결제 처리 원칙

Android 소모성 결제는 `autoConsume=false`로 시작해 서버 확인 전에 소비되지 않게 합니다. 서버가 200으로 확인한 뒤에만 결제를 완료하고, 이미 사용된 토큰(409)도 완료합니다. 그 밖의 실패에서는 결제를 미완료 상태로 남겨 스토어가 재전달할 수 있게 하며, 승인되지 않은 결제는 Play 정책에 따라 자동 환불됩니다. 앱 시작 시 Android에서는 `recoverUnfinished()`로 미완료 결제를 복구합니다.

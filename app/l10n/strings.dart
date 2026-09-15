import 'package:flutter/widgets.dart';

class AppStrings {
  AppStrings._(this._isKo);
  final bool _isKo;
  static AppStrings of(BuildContext context) =>
      AppStrings._(Localizations.localeOf(context).languageCode == 'ko');
  String operator [](String key) => (_isKo ? _ko : _en)[key] ?? key;
  String get localeCode => _isKo ? 'ko' : 'en';
}

const _ko = <String, String>{
  'history':'기록','about':'정보','topic':'조사 주제','brief':'추가 요청 (선택)','email':'이메일','emailReason':'리포트를 이 주소로 보내드립니다','language':'리포트 언어','korean':'한국어','english':'English','loadingProducts':'스토어 상품을 불러오는 중…','payStart':'결제하고 조사 시작','purchaseWaiting':'결제를 확인하고 있습니다…','invalidTopic':'주제를 5자 이상 입력해 주세요','invalidEmail':'올바른 이메일을 입력해 주세요','purchaseError':'결제를 시작할 수 없습니다','productsUnavailable':'상품을 사용할 수 없습니다','status':'진행 상태','report':'리포트 보기','reportEmail':'완료되면 이메일로도 보내드립니다','reportIssue':'문제 신고','copy':'복사','copied':'복사했습니다','orderId':'주문 번호','emptyHistory':'아직 주문 기록이 없습니다','privacy':'개인정보 처리방침','terms':'이용약관','support':'고객 지원','restore':'미완료 결제 복구','restoreDone':'복구 요청을 보냈습니다','paymentStore':'결제는 Google Play / App Store를 통해 처리됩니다','openBrowser':'브라우저에서 열기','loading':'불러오는 중…','done':'완료','failed':'실패','awaiting_payment':'결제 대기','paid':'결제 완료','queued':'대기열','running':'조사 중','pending':'결제 처리 중','canceled':'결제가 취소되었습니다','purchaseConfirmed':'결제가 확인되었습니다','tryAgain':'다시 시도해 주세요','order':'주문','noReport':'리포트가 아직 준비되지 않았습니다','appDescription':'AI 리서치 리포트 서비스','tierLight':'라이트','tierStandard':'스탠더드','tierDeep':'딥',
};
const _en = <String, String>{
  'history':'History','about':'About','topic':'Research topic','brief':'Additional request (optional)','email':'Email','emailReason':"We'll send the report to this address",'language':'Report language','korean':'한국어','english':'English','loadingProducts':'Loading store products…','payStart':'Pay and start research','purchaseWaiting':'Confirming your purchase…','invalidTopic':'Enter at least 5 characters for the topic','invalidEmail':'Enter a valid email address','purchaseError':'Could not start the purchase','productsUnavailable':'Products are unavailable','status':'Status','report':'View report','reportEmail':'We will also email you when it is ready.','reportIssue':'Report an issue','copy':'Copy','copied':'Copied','orderId':'Order ID','emptyHistory':'No orders yet','privacy':'Privacy','terms':'Terms','support':'Support','restore':'Restore unfinished purchases','restoreDone':'Restore request sent','paymentStore':'Payment is handled through Google Play / the App Store','openBrowser':'Open in browser','loading':'Loading…','done':'Done','failed':'Failed','awaiting_payment':'Awaiting payment','paid':'Paid','queued':'Queued','running':'Researching','pending':'Purchase pending','canceled':'Purchase cancelled','purchaseConfirmed':'Purchase confirmed','tryAgain':'Please try again','order':'Order','noReport':'The report is not ready yet','appDescription':'AI research reports','tierLight':'Light','tierStandard':'Standard','tierDeep':'Deep',
};

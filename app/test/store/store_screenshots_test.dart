import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:deepdesk_app/providers.dart';
import 'package:deepdesk_app/screens/about_screen.dart';
import 'package:deepdesk_app/screens/history_screen.dart';
import 'package:deepdesk_app/screens/order_screen.dart';
import 'package:deepdesk_app/screens/order_status_screen.dart';
import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/services/purchase_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _StoreGateway implements StoreGateway {
  final events = StreamController<List<PurchaseDetails>>();

  @override
  Stream<List<PurchaseDetails>> get purchaseStream => events.stream;
  @override
  Future<bool> isAvailable() async => true;
  @override
  Future<ProductDetailsResponse> queryProductDetails(Set<String> ids) async =>
      ProductDetailsResponse(productDetails: const [], notFoundIDs: const []);
  @override
  Future<bool> buyConsumable({required PurchaseParam purchaseParam, bool autoConsume = true}) async => true;
  @override
  Future<void> completePurchase(PurchaseDetails purchase) async {}
  @override
  Future<void> finishPurchase(PurchaseDetails purchase) async {}
  @override
  Future<void> restorePurchases() async {}
}

class _DeviceProfile {
  const _DeviceProfile(this.outputDirectory, this.physicalSize, this.devicePixelRatio);

  final String outputDirectory;
  final Size physicalSize;
  final double devicePixelRatio;
}

const _phone = _DeviceProfile('phone', Size(1080, 2160), 3);
const _tablet7 = _DeviceProfile('tablet7', Size(1200, 1920), 2);
const _tablet10 = _DeviceProfile('tablet10', Size(1600, 2560), 2);

ServerConfig _config() => ServerConfig(
  tiers: {
    'light': TierInfo(id: 'light', label: '라이트', pages: 'A4 7~8쪽', hours: 24),
    'standard': TierInfo(id: 'standard', label: '스탠다드', pages: 'A4 10~13쪽', hours: 48),
    'deep': TierInfo(id: 'deep', label: '딥', pages: 'A4 20쪽+ · 차트 포함', hours: 72),
  },
  productIds: const {
    'light': 'deepdesk_light',
    'standard': 'deepdesk_standard',
    'deep': 'deepdesk_deep',
  },
);

List<ProductDetails> _products(bool ko) {
  final prices = ko ? const ['₩4,900', '₩14,900', '₩29,900'] : const ['\$3.49', '\$9.99', '\$19.99'];
  return List.generate(3, (index) {
    const ids = ['light', 'standard', 'deep'];
    return ProductDetails(
      id: 'deepdesk_${ids[index]}',
      title: ids[index],
      description: 'DeepDesk research report',
      price: prices[index],
      rawPrice: [4900, 14900, 29900][index].toDouble(),
      currencyCode: ko ? 'KRW' : 'USD',
    );
  });
}

OrderStatus _status(bool ko, {required bool done}) => OrderStatus(
  id: done ? 'DD-20260915-0842' : 'DD-20260915-0841',
  status: done ? 'done' : 'running',
  tier: 'standard',
  createdAt: '2026-09-15 10:24',
  topic: ko ? '서울 20대 여성 대상 비건 카페 창업 시장성' : 'Market viability of a vegan cafe for women in their 20s in Seoul',
  reportPath: done ? '/reports/DD-20260915-0842' : null,
  progress: ko
      ? [
          ProgressLine('10:24', '결제 확인 — 조사 대기열에 등록'),
          ProgressLine('10:26', '조사 계획 수립: 8개 세부 질문'),
          ProgressLine('10:31', '세부 조사 3/8 완료 (출처 41건)'),
          ProgressLine('10:37', '공식 데이터 확보 — KOSIS 2건'),
          ProgressLine('10:42', done ? '종합 리포트 작성 완료' : '종합 리포트 작성 중'),
        ]
      : [
          ProgressLine('10:24', 'Payment confirmed — added to the research queue'),
          ProgressLine('10:26', 'Research plan created: 8 detailed questions'),
          ProgressLine('10:31', 'Detailed research 3/8 complete (41 sources)'),
          ProgressLine('10:37', 'Official data collected — 2 KOSIS datasets'),
          ProgressLine('10:42', done ? 'Research report complete' : 'Writing the research report'),
        ],
);

Future<void> _loadNotoFont(String path, FontLoader loader) async {
  final bytes = await File(path).readAsBytes();
  loader.addFont(Future<ByteData>.value(ByteData.sublistView(bytes)));
}

void main() {
  if (!(const bool.fromEnvironment('STORE_SHOTS') ||
      const String.fromEnvironment('STORE_SHOTS') == '1')) {
    return;
  }

  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    final loader = FontLoader('NotoSansKR');
    await _loadNotoFont('test/store/fonts/NotoSansCJKkr-Regular.otf', loader);
    await _loadNotoFont('test/store/fonts/NotoSansCJKkr-Bold.otf', loader);
    await loader.load();
    // Flutter's material icon font is not part of a test app's asset bundle.
    // Load the SDK copy so captured controls retain their real glyphs.
    final flutterRoot = Platform.environment['FLUTTER_ROOT'] ??
        File(Platform.resolvedExecutable).parent.parent.parent.parent.path;
    final iconLoader = FontLoader('MaterialIcons');
    await _loadNotoFont(
      '$flutterRoot/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
      iconLoader,
    );
    await iconLoader.load();
  });

  Future<void> setSurface(WidgetTester tester, _DeviceProfile profile) async {
    tester.view.physicalSize = profile.physicalSize;
    tester.view.devicePixelRatio = profile.devicePixelRatio;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Future<void> pumpStoreApp(
    WidgetTester tester, {
    required bool ko,
    required Widget home,
    _DeviceProfile profile = _phone,
    OrderStatus? fixedStatus,
    Map<String, Object>? preferences,
  }) async {
    await setSurface(tester, profile);
    SharedPreferences.setMockInitialValues(preferences ?? {});
    final prefs = await SharedPreferences.getInstance();
    final gateway = _StoreGateway();
    final service = PurchaseService(
      gateway: gateway,
      api: ApiClient(baseUrl: 'https://example.invalid'),
      prefs: prefs,
      platform: () => 'android',
    );
    addTearDown(service.dispose);
    addTearDown(gateway.events.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          configProvider.overrideWith((_) async => _config()),
          productsProvider.overrideWith((_) async => _products(ko)),
          purchaseServiceProvider.overrideWithValue(service),
          if (fixedStatus != null)
            orderStatusProvider.overrideWith((ref, orderId) async* {
              yield fixedStatus;
            }),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          locale: Locale(ko ? 'ko' : 'en'),
          supportedLocales: const [Locale('ko'), Locale('en')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          theme: ThemeData(
            useMaterial3: true,
            fontFamily: 'NotoSansKR',
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF123B73)),
          ),
          home: home,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> selectReportLanguage(WidgetTester tester, bool ko) async {
    if (ko) {
      await tester.tap(find.text('한국어'));
      await tester.pumpAndSettle();
    }
  }

  Future<void> capture(WidgetTester tester, String locale, String file) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('../../store/out/screenshots/$locale/$file.png'),
    );
  }

  for (final ko in [true, false]) {
    final locale = ko ? 'ko' : 'en';
    final topic = ko
        ? '서울 20대 여성 대상 비건 카페 창업 시장성'
        : 'Market viability of a vegan cafe for women in their 20s in Seoul';

    testWidgets('$locale 01 order top', (tester) async {
      await pumpStoreApp(tester, ko: ko, home: const OrderScreen());
      await tester.enterText(find.byType(TextField).at(0), topic);
      await tester.enterText(find.byType(TextField).at(2), 'hello@example.com');
      await tester.pump();
      await selectReportLanguage(tester, ko);
      await tester.drag(find.byType(ListView), const Offset(0, 1000));
      await tester.pumpAndSettle();
      await capture(tester, locale, '01_order_top');
    });

    testWidgets('$locale 01 order tiers', (tester) async {
      await pumpStoreApp(tester, ko: ko, home: const OrderScreen());
      await tester.enterText(find.byType(TextField).at(0), topic);
      await tester.enterText(find.byType(TextField).at(2), 'hello@example.com');
      await tester.pump();
      await selectReportLanguage(tester, ko);
      await tester.dragUntilVisible(
        find.byType(FilledButton),
        find.byType(ListView),
        const Offset(0, -300),
      );
      await tester.pumpAndSettle();
      expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
      await capture(tester, locale, '01_order_tiers');
    });

    testWidgets('$locale 02 progress', (tester) async {
      await pumpStoreApp(tester, ko: ko, home: const OrderStatusScreen(orderId: 'DD-20260915-0841'), fixedStatus: _status(ko, done: false));
      await tester.scrollUntilVisible(
        find.text(ko ? '완료되면 이메일로도 보내드립니다' : 'We will also email you when it is ready.'),
        200,
        scrollable: find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Scrollable),
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, locale, '02_progress');
    });

    testWidgets('$locale 03 done', (tester) async {
      await pumpStoreApp(tester, ko: ko, home: const OrderStatusScreen(orderId: 'DD-20260915-0842'), fixedStatus: _status(ko, done: true));
      await tester.scrollUntilVisible(
        find.byType(FilledButton),
        200,
        scrollable: find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Scrollable),
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, locale, '03_done');
    });

    testWidgets('$locale 04 history', (tester) async {
      final orders = [
        {'id': 'DD-0842', 'topic': topic, 'tier': 'standard', 'createdAt': '2026-09-15 10:24', 'lastStatus': 'done'},
        {'id': 'DD-0839', 'topic': ko ? '성수동 친환경 생활용품 시장 조사' : 'Eco-friendly home goods market in Seongsu', 'tier': 'light', 'createdAt': '2026-09-14 14:08', 'lastStatus': 'running'},
        {'id': 'DD-0837', 'topic': ko ? 'B2B SaaS 고객 이탈 요인 분석' : 'B2B SaaS customer churn analysis', 'tier': 'deep', 'createdAt': '2026-09-13 09:16', 'lastStatus': 'queued'},
      ];
      await pumpStoreApp(tester, ko: ko, home: const HistoryScreen(), preferences: {'orders': jsonEncode(orders)});
      await capture(tester, locale, '04_history');
    });

    testWidgets('$locale 05 about', (tester) async {
      await pumpStoreApp(tester, ko: ko, home: const AboutScreen());
      await capture(tester, locale, '05_about');
    });
  }

  for (final profile in [_tablet7, _tablet10]) {
    const ko = true;
    const topic = '서울 20대 여성 대상 비건 카페 창업 시장성';

    testWidgets('${profile.outputDirectory} 01 order top', (tester) async {
      await pumpStoreApp(
        tester,
        ko: ko,
        profile: profile,
        home: const OrderScreen(),
      );
      await tester.enterText(find.byType(TextField).at(0), topic);
      await tester.enterText(find.byType(TextField).at(2), 'hello@example.com');
      await tester.pump();
      await selectReportLanguage(tester, ko);
      await tester.drag(find.byType(ListView), const Offset(0, 1000));
      await tester.pumpAndSettle();
      await capture(tester, profile.outputDirectory, '01_order_top');
    });

    testWidgets('${profile.outputDirectory} 01 order tiers', (tester) async {
      await pumpStoreApp(
        tester,
        ko: ko,
        profile: profile,
        home: const OrderScreen(),
      );
      await tester.enterText(find.byType(TextField).at(0), topic);
      await tester.enterText(find.byType(TextField).at(2), 'hello@example.com');
      await tester.pump();
      await selectReportLanguage(tester, ko);
      await tester.dragUntilVisible(
        find.byType(FilledButton),
        find.byType(ListView),
        const Offset(0, -300),
      );
      await tester.pumpAndSettle();
      expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
      await capture(tester, profile.outputDirectory, '01_order_tiers');
    });

    testWidgets('${profile.outputDirectory} 02 progress', (tester) async {
      await pumpStoreApp(
        tester,
        ko: ko,
        profile: profile,
        home: const OrderStatusScreen(orderId: 'DD-20260915-0841'),
        fixedStatus: _status(ko, done: false),
      );
      await tester.scrollUntilVisible(
        find.text('완료되면 이메일로도 보내드립니다'),
        200,
        scrollable: find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Scrollable),
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, profile.outputDirectory, '02_progress');
    });

    testWidgets('${profile.outputDirectory} 03 done', (tester) async {
      await pumpStoreApp(
        tester,
        ko: ko,
        profile: profile,
        home: const OrderStatusScreen(orderId: 'DD-20260915-0842'),
        fixedStatus: _status(ko, done: true),
      );
      await tester.scrollUntilVisible(
        find.byType(FilledButton),
        200,
        scrollable: find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Scrollable),
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, profile.outputDirectory, '03_done');
    });
  }
}

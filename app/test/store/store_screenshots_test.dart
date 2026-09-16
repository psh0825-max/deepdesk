// Store listing screenshots rendered from the real widgets.
// Run: flutter test test/store --dart-define=STORE_SHOTS=1 --update-goldens
// Fonts (gitignored): test/store/fonts/NotoSansCJKkr-{Regular,Bold}.otf
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:deepdesk_app/providers.dart';
import 'package:deepdesk_app/screens/order_screen.dart';
import 'package:deepdesk_app/screens/order_status_screen.dart';
import 'package:deepdesk_app/screens/root_shell.dart';
import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/services/purchase_service.dart';
import 'package:deepdesk_app/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
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
  Future<bool> buyConsumable({
    required PurchaseParam purchaseParam,
    bool autoConsume = true,
  }) async => true;
  @override
  Future<void> completePurchase(PurchaseDetails purchase) async {}
  @override
  Future<void> finishPurchase(PurchaseDetails purchase) async {}
  @override
  Future<void> restorePurchases() async {}
}

class _Profile {
  const _Profile(this.dir, this.physicalSize, this.dpr, this.locales);
  final String dir;
  final Size physicalSize;
  final double dpr;
  final List<String> locales;
}

// Play: phone + 7"/10" tablets. App Store: 6.9" (ko/en) + 6.5" (ko).
const _profiles = [
  _Profile('phone', Size(1080, 2160), 3, ['ko', 'en']),
  _Profile('tablet7', Size(1200, 1920), 2, ['ko', 'en']),
  _Profile('tablet10', Size(1600, 2560), 2, ['ko', 'en']),
  _Profile('iphone69', Size(1320, 2868), 3, ['ko', 'en']),
  _Profile('iphone65', Size(1242, 2688), 3, ['ko']),
];

const _shots = [
  '01_home',
  '02_pricing',
  '03_order',
  '04_progress',
  '05_done',
  '06_reports',
  '07_settings',
];

// Legacy Play directories (phone/ko → ko, phone/en → en) keep their old paths.
String _outDir(_Profile p, String locale) {
  if (p.dir == 'phone') {
    return locale;
  }
  return p.locales.length > 1 ? '${p.dir}/$locale' : p.dir;
}

ServerConfig _config(bool ko) => ServerConfig(
  tiers: {
    'light': TierInfo(
      id: 'light',
      label: ko ? '라이트' : 'Light',
      pages: ko ? 'A4 7~8쪽' : '7–8 pages',
      hours: 24,
    ),
    'standard': TierInfo(
      id: 'standard',
      label: ko ? '스탠다드' : 'Standard',
      pages: ko ? 'A4 10~13쪽' : '10–13 pages',
      hours: 48,
    ),
    'deep': TierInfo(
      id: 'deep',
      label: ko ? '딥' : 'Deep',
      pages: ko ? 'A4 20쪽+ · 차트 포함' : '20+ pages · charts',
      hours: 72,
    ),
  },
  productIds: const {
    'light': 'deepdesk_light',
    'standard': 'deepdesk_standard',
    'deep': 'deepdesk_deep',
  },
);

List<ProductDetails> _products(bool ko) {
  final prices = ko
      ? const ['₩4,900', '₩14,900', '₩29,900']
      : const ['\$3.49', '\$9.99', '\$19.99'];
  const ids = ['light', 'standard', 'deep'];
  return List.generate(
    3,
    (i) => ProductDetails(
      id: 'deepdesk_${ids[i]}',
      title: ids[i],
      description: 'DeepDesk research report',
      price: prices[i],
      rawPrice: [4900, 14900, 29900][i].toDouble(),
      currencyCode: ko ? 'KRW' : 'USD',
    ),
  );
}

String _topic(bool ko) => ko
    ? '서울 20대 여성 대상 비건 카페 창업 시장성'
    : 'Market viability of a vegan cafe for women in their 20s in Seoul';

OrderStatus _status(bool ko, {required bool done}) => OrderStatus(
  id: done ? 'DD-20260915-0842' : 'DD-20260915-0841',
  status: done ? 'done' : 'running',
  tier: 'standard',
  tierLabel: ko ? '스탠다드' : 'Standard',
  createdAt: '2026-09-15 10:24',
  topic: _topic(ko),
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
          ProgressLine('10:24', 'Payment confirmed — added to the queue'),
          ProgressLine('10:26', 'Research plan created: 8 sub-questions'),
          ProgressLine('10:31', 'Sub-research 3/8 complete (41 sources)'),
          ProgressLine('10:37', 'Official data collected — 2 KOSIS datasets'),
          ProgressLine(
            '10:42',
            done ? 'Research report complete' : 'Writing the research report',
          ),
        ],
);

Map<String, Object> _historyPrefs(bool ko) {
  final now = DateTime.now();
  String ago(Duration d) => now.subtract(d).toIso8601String();
  final orders = [
    {
      'id': 'DD-20260915-0842',
      'topic': _topic(ko),
      'tier': 'standard',
      'createdAt': ago(const Duration(hours: 2)),
      'lastStatus': 'done',
    },
    {
      'id': 'DD-20260914-0839',
      'topic': ko
          ? '성수동 친환경 생활용품 시장 조사'
          : 'Eco-friendly home goods market in Seongsu',
      'tier': 'light',
      'createdAt': ago(const Duration(days: 1, hours: 3)),
      'lastStatus': 'running',
    },
    {
      'id': 'DD-20260913-0837',
      'topic': ko ? 'B2B SaaS 고객 이탈 요인 분석' : 'B2B SaaS customer churn analysis',
      'tier': 'deep',
      'createdAt': ago(const Duration(days: 6)),
      'lastStatus': 'done',
    },
  ];
  return {'orders': jsonEncode(orders)};
}

Future<void> _loadFont(String path, FontLoader loader) async {
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
    await _loadFont('test/store/fonts/NotoSansCJKkr-Regular.otf', loader);
    await _loadFont('test/store/fonts/NotoSansCJKkr-Bold.otf', loader);
    await loader.load();
    // The material icon font is not in a test app's bundle; load the SDK copy.
    final flutterRoot =
        Platform.environment['FLUTTER_ROOT'] ??
        File(Platform.resolvedExecutable).parent.parent.parent.parent.path;
    final icons = FontLoader('MaterialIcons');
    await _loadFont(
      '$flutterRoot/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
      icons,
    );
    await icons.load();
  });

  Future<void> verifyPng(File file, Size expected) async {
    final bytes = await file.readAsBytes();
    expect(bytes.length, greaterThan(33), reason: '${file.path} too small');
    expect(
      bytes.sublist(0, 8),
      equals(const [137, 80, 78, 71, 13, 10, 26, 10]),
    );
    final header = ByteData.sublistView(bytes);
    expect(header.getUint32(16), expected.width.toInt(), reason: 'width');
    expect(header.getUint32(20), expected.height.toInt(), reason: 'height');
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final raw = (await frame.image.toByteData(
      format: ui.ImageByteFormat.rawRgba,
    ))!.buffer.asUint8List();
    final first = raw.sublist(0, 4);
    final varied = Iterable<int>.generate(raw.length ~/ 4).skip(1).any((p) {
      final o = p * 4;
      return raw[o] != first[0] ||
          raw[o + 1] != first[1] ||
          raw[o + 2] != first[2] ||
          raw[o + 3] != first[3];
    });
    frame.image.dispose();
    codec.dispose();
    expect(varied, isTrue, reason: '${file.path} must not be blank');
  }

  tearDownAll(() async {
    for (final p in _profiles) {
      for (final locale in p.locales) {
        for (final shot in _shots) {
          await verifyPng(
            File('store/out/screenshots/${_outDir(p, locale)}/$shot.png'),
            p.physicalSize,
          );
        }
      }
    }
    // Apple requires one review screenshot per in-app product; the pricing shot fits.
    final source = File('store/out/screenshots/iphone69/ko/02_pricing.png');
    final out = Directory('store/out/iap-review');
    await out.create(recursive: true);
    for (final id in ['deepdesk_light', 'deepdesk_standard', 'deepdesk_deep']) {
      await verifyPng(
        await source.copy('${out.path}/$id.png'),
        _profiles[3].physicalSize,
      );
    }
  });

  Future<void> pumpApp(
    WidgetTester tester, {
    required _Profile profile,
    required bool ko,
    required Widget home,
    OrderStatus? fixedStatus,
    Map<String, Object>? prefsValues,
  }) async {
    tester.view.physicalSize = profile.physicalSize;
    tester.view.devicePixelRatio = profile.dpr;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues(prefsValues ?? {});
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
          configProvider.overrideWith((_) async => _config(ko)),
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
          theme: AppTheme.light(fontFamily: 'NotoSansKR'),
          home: home,
        ),
      ),
    );
    // The brand icon is decoded asynchronously; force it in before capturing.
    await tester.runAsync(
      () => precacheImage(
        const AssetImage('assets/icon.png'),
        tester.element(find.byType(MaterialApp)),
      ),
    );
    // Progress indicators and the timeline pulse animate forever: never settle.
    await tester.pump(const Duration(milliseconds: 600));
  }

  Future<void> capture(WidgetTester tester, String dir, String file) async {
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pump(const Duration(milliseconds: 300));
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('../../store/out/screenshots/$dir/$file.png'),
    );
  }

  Finder listScrollable() => find
      .descendant(of: find.byType(ListView), matching: find.byType(Scrollable))
      .first;

  for (final profile in _profiles) {
    for (final locale in profile.locales) {
      final ko = locale == 'ko';
      final dir = _outDir(profile, locale);
      final tag = '${profile.dir}/$locale';

      testWidgets('$tag 01 home', (tester) async {
        await pumpApp(
          tester,
          profile: profile,
          ko: ko,
          home: const RootShell(),
        );
        await capture(tester, dir, '01_home');
      });

      testWidgets('$tag 02 pricing', (tester) async {
        await pumpApp(
          tester,
          profile: profile,
          ko: ko,
          home: const RootShell(),
        );
        final deepPrice = find.text(ko ? '₩29,900' : '\$19.99');
        for (var i = 0; i < 30 && deepPrice.evaluate().isEmpty; i++) {
          await tester.drag(
            find.byType(Scrollable).first,
            const Offset(0, -300),
          );
          await tester.pump(const Duration(milliseconds: 300));
        }
        await tester.ensureVisible(deepPrice);
        await tester.pump(const Duration(milliseconds: 300));
        await capture(tester, dir, '02_pricing');
      });

      testWidgets('$tag 03 order', (tester) async {
        await pumpApp(
          tester,
          profile: profile,
          ko: ko,
          home: OrderScreen(initialTopic: _topic(ko)),
        );
        // Off-screen ListView children are unbuilt, so locate the email field
        // by its hint instead of by index.
        final emailField = find.ancestor(
          of: find.text('name@example.com'),
          matching: find.byType(TextField),
        );
        for (var i = 0; i < 30 && emailField.evaluate().isEmpty; i++) {
          await tester.drag(listScrollable(), const Offset(0, -200));
          await tester.pump(const Duration(milliseconds: 300));
        }
        await tester.ensureVisible(emailField);
        await tester.enterText(emailField, 'hello@example.com');
        await tester.pump();
        if (ko) {
          final korean = find.text('한국어');
          for (var i = 0; i < 30 && korean.evaluate().isEmpty; i++) {
            await tester.drag(listScrollable(), const Offset(0, -300));
            await tester.pump(const Duration(milliseconds: 300));
          }
          await tester.ensureVisible(korean);
          await tester.tap(korean);
          await tester.pump();
        }
        final deepPrice = find.text(ko ? '₩29,900' : '\$19.99');
        for (var i = 0; i < 30 && deepPrice.evaluate().isEmpty; i++) {
          await tester.drag(listScrollable(), const Offset(0, -300));
          await tester.pump(const Duration(milliseconds: 300));
        }
        await tester.ensureVisible(deepPrice.first);
        await tester.pump(const Duration(milliseconds: 300));
        expect(
          tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
          isNotNull,
        );
        await capture(tester, dir, '03_order');
      });

      testWidgets('$tag 04 progress', (tester) async {
        await pumpApp(
          tester,
          profile: profile,
          ko: ko,
          home: const OrderStatusScreen(orderId: 'DD-20260915-0841'),
          fixedStatus: _status(ko, done: false),
        );
        await capture(tester, dir, '04_progress');
      });

      testWidgets('$tag 05 done', (tester) async {
        await pumpApp(
          tester,
          profile: profile,
          ko: ko,
          home: const OrderStatusScreen(orderId: 'DD-20260915-0842'),
          fixedStatus: _status(ko, done: true),
        );
        await capture(tester, dir, '05_done');
      });

      testWidgets('$tag 06 reports', (tester) async {
        await pumpApp(
          tester,
          profile: profile,
          ko: ko,
          home: const RootShell(),
          prefsValues: _historyPrefs(ko),
        );
        await tester.tap(find.text(ko ? '내 리포트' : 'My reports'));
        await tester.pump(const Duration(milliseconds: 400));
        await capture(tester, dir, '06_reports');
      });

      testWidgets('$tag 07 settings', (tester) async {
        await pumpApp(
          tester,
          profile: profile,
          ko: ko,
          home: const RootShell(),
        );
        await tester.tap(find.text(ko ? '설정' : 'Settings'));
        await tester.pump(const Duration(milliseconds: 400));
        await capture(tester, dir, '07_settings');
      });
    }
  }
}

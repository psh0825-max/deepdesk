import 'package:deepdesk_app/providers.dart';
import 'package:deepdesk_app/screens/home_screen.dart';
import 'package:deepdesk_app/screens/order_screen.dart';
import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/services/purchase_service.dart';
import 'package:deepdesk_app/theme/app_theme.dart';
import 'package:deepdesk_app/widgets/error_view.dart';
import 'package:deepdesk_app/widgets/info_row.dart';
import 'package:deepdesk_app/widgets/tier_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_store.dart';
import 'helpers/fixtures.dart';
import 'helpers/scroll.dart';

Future<void> _pumpHome(
  WidgetTester tester, {
  required Future<ServerConfig> Function(Ref) config,
  required Future<List<ProductDetails>> Function(Ref) products,
  bool autoRetry = true,
}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 2.625;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final store = FakeStoreGateway();
  final service = PurchaseService(
    gateway: store,
    api: ApiClient(baseUrl: 'https://example.invalid'),
    prefs: prefs,
    platform: () => 'android',
  );
  addTearDown(service.dispose);
  addTearDown(store.events.close);
  await tester.pumpWidget(
    ProviderScope(
      // Riverpod 3 retries failed providers on its own; tests of the manual
      // Retry button must turn that off to observe the error state.
      retry: autoRetry ? null : (_, _) => null,
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        configProvider.overrideWith(config),
        productsProvider.overrideWith(products),
        purchaseServiceProvider.overrideWithValue(service),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('en'),
        home: const HomeScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _scrollToPlans(WidgetTester tester) async {
  await scrollUntilFound(
    tester,
    find.byType(TierCard),
    find.byType(Scrollable).first,
  );
}

void main() {
  testWidgets('home renders hero and priced plan cards', (tester) async {
    await _pumpHome(
      tester,
      config: (_) async => testConfig(),
      products: (_) async => testProducts(),
    );
    expect(
      find.text('Ask anything.\nAn AI analyst researches and reports back'),
      findsOneWidget,
    );
    await _scrollToPlans(tester);
    expect(find.byType(TierCard), findsNWidgets(3));
    expect(find.text('\$3.49'), findsOneWidget);
    expect(find.text('\$9.99'), findsOneWidget);
    expect(find.text('\$19.99'), findsOneWidget);
    expect(find.text('Popular'), findsOneWidget);
  });

  testWidgets('home shows loading text when store products are empty', (
    tester,
  ) async {
    await _pumpHome(
      tester,
      config: (_) async => testConfig(),
      products: (_) async => [],
    );
    await _scrollToPlans(tester);
    expect(find.text('Loading store products…'), findsNWidgets(3));
  });

  testWidgets('tapping the Standard card opens checkout with it selected', (
    tester,
  ) async {
    await _pumpHome(
      tester,
      config: (_) async => testConfig(),
      products: (_) async => testProducts(),
    );
    await _scrollToPlans(tester);
    await tester.ensureVisible(find.byType(TierCard).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(TierCard).at(1));
    await tester.pumpAndSettle();

    expect(find.byType(OrderScreen), findsOneWidget);
    await scrollUntilFound(
      tester,
      find.byType(InfoRow),
      find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    // The checkout summary names the plan that was tapped on the home screen.
    expect(
      find.descendant(
        of: find.byType(InfoRow),
        matching: find.text('Standard'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('tapping a use-case chip prefills the topic', (tester) async {
    await _pumpHome(
      tester,
      config: (_) async => testConfig(),
      products: (_) async => testProducts(),
    );
    await scrollUntilFound(
      tester,
      find.text('Market research'),
      find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.text('Market research'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Market research'));
    await tester.pumpAndSettle();

    expect(find.byType(OrderScreen), findsOneWidget);
    final topic = tester.widget<TextField>(find.byType(TextField).first);
    expect(
      topic.controller!.text,
      'Market potential of a vegan café for women in their 20s in Seoul',
    );
  });

  testWidgets('config errors show an error view and retry reloads', (
    tester,
  ) async {
    var attempts = 0;
    await _pumpHome(
      tester,
      config: (_) async {
        attempts++;
        if (attempts == 1) {
          throw Exception('offline');
        }
        return testConfig();
      },
      products: (_) async => testProducts(),
      autoRetry: false,
    );
    await scrollUntilFound(
      tester,
      find.byType(ErrorView),
      find.byType(Scrollable).first,
    );
    expect(find.byType(ErrorView), findsOneWidget);

    await tester.ensureVisible(find.text('Retry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(attempts, 2);
    expect(find.byType(ErrorView), findsNothing);
    expect(find.byType(TierCard), findsNWidgets(3));
  });
}

import 'package:deepdesk_app/providers.dart';
import 'package:deepdesk_app/screens/order_screen.dart';
import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/services/purchase_service.dart';
import 'package:deepdesk_app/theme/app_theme.dart';
import 'helpers/fake_store.dart';
import 'helpers/scroll.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';

ServerConfig config() {
  return ServerConfig(
    tiers: {
      'light': TierInfo(id: 'light', label: 'Light', pages: '7', hours: 24),
      'standard': TierInfo(
        id: 'standard',
        label: 'Standard',
        pages: '15',
        hours: 48,
      ),
      'deep': TierInfo(id: 'deep', label: 'Deep', pages: '30', hours: 72),
    },
    productIds: {
      'light': 'deepdesk_light',
      'standard': 'deepdesk_standard',
      'deep': 'deepdesk_deep',
    },
  );
}

List<ProductDetails> products() {
  return [
    ProductDetails(
      id: 'deepdesk_light',
      title: 'Light',
      description: 'Light research',
      price: '₩4,900',
      rawPrice: 4900,
      currencyCode: 'KRW',
    ),
    ProductDetails(
      id: 'deepdesk_standard',
      title: 'Standard',
      description: 'Standard research',
      price: '₩14,900',
      rawPrice: 14900,
      currencyCode: 'KRW',
    ),
    ProductDetails(
      id: 'deepdesk_deep',
      title: 'Deep',
      description: 'Deep research',
      price: '₩29,900',
      rawPrice: 29900,
      currencyCode: 'KRW',
    ),
  ];
}

Future<void> pumpOrderScreen(
  WidgetTester tester, {
  required List<ProductDetails> availableProducts,
}) async {
  // Phone-sized viewport so the lazily built ListView holds all three fields.
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
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        configProvider.overrideWith((_) async => config()),
        productsProvider.overrideWith((_) async => availableProducts),
        purchaseServiceProvider.overrideWithValue(service),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('en'),
        home: const OrderScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

FilledButton payButton(WidgetTester tester) {
  return tester.widget<FilledButton>(
    find.widgetWithText(FilledButton, 'Pay and start research'),
  );
}

Future<void> revealPayButton(WidgetTester tester) async {
  await tester.drag(find.byType(ListView), const Offset(0, -800));
  await tester.pumpAndSettle();
}

Future<void> enterValidOrderDetails(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).at(0), 'Flutter research');
  await tester.enterText(find.byType(TextField).at(2), 'user@example.com');
  await tester.pump();
}

void main() {
  testWidgets(
    'CTA is disabled when the topic is shorter than five characters',
    (tester) async {
      await pumpOrderScreen(tester, availableProducts: products());

      await tester.enterText(find.byType(TextField).at(0), 'four');
      await tester.enterText(find.byType(TextField).at(2), 'user@example.com');
      await tester.pump();
      await revealPayButton(tester);

      expect(payButton(tester).onPressed, isNull);
    },
  );

  testWidgets('CTA is disabled when the email is invalid', (tester) async {
    await pumpOrderScreen(tester, availableProducts: products());

    await tester.enterText(find.byType(TextField).at(0), 'Flutter research');
    await tester.enterText(find.byType(TextField).at(2), 'not-an-email');
    await tester.pump();
    await revealPayButton(tester);

    expect(payButton(tester).onPressed, isNull);
  });

  testWidgets('CTA is disabled when products have not loaded', (tester) async {
    await pumpOrderScreen(tester, availableProducts: []);

    await enterValidOrderDetails(tester);
    await revealPayButton(tester);

    expect(payButton(tester).onPressed, isNull);
  });

  testWidgets('CTA is enabled with valid details and loaded products', (
    tester,
  ) async {
    await pumpOrderScreen(tester, availableProducts: products());

    await enterValidOrderDetails(tester);
    await revealPayButton(tester);

    expect(payButton(tester).onPressed, isNotNull);
  });

  testWidgets('tier cards show all store price strings', (tester) async {
    await pumpOrderScreen(tester, availableProducts: products());

    // The selected plan's price also appears in the order summary.
    for (final price in ['₩4,900', '₩14,900', '₩29,900']) {
      await scrollUntilFound(
        tester,
        find.text(price),
        find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
    }
  });

  testWidgets('email reason text is visible', (tester) async {
    await pumpOrderScreen(tester, availableProducts: products());

    expect(find.text("We'll send the report to this address"), findsOneWidget);
  });
}

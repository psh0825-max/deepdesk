import 'package:deepdesk_app/providers.dart';
import 'package:deepdesk_app/screens/settings_screen.dart';
import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/services/purchase_service.dart';
import 'package:deepdesk_app/theme/app_theme.dart';
import 'helpers/fake_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('settings renders groups and restores purchases', (tester) async {
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
          purchaseServiceProvider.overrideWithValue(service),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          locale: const Locale('en'),
          home: const SettingsScreen(),
        ),
      ),
    );
    expect(find.text('SUPPORT'), findsOneWidget);
    expect(find.text('PAYMENTS'), findsOneWidget);
    expect(find.text('LEGAL'), findsOneWidget);
    expect(find.text(''), findsWidgets);
    await tester.tap(find.text('Restore unfinished purchases'));
    await tester.pump();
    expect(store.restoreCalls, 1);
  });
}

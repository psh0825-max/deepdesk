import 'package:deepdesk_app/providers.dart';
import 'package:deepdesk_app/screens/order_status_screen.dart';
import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/theme/app_theme.dart';
import 'helpers/fixtures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _pump(WidgetTester tester, OrderStatus order) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 2.625;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        configProvider.overrideWith((_) async => testConfig()),
        orderStatusProvider.overrideWith((_, _) async* {
          yield order;
        }),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('en'),
        home: const OrderStatusScreen(orderId: 'DD-1'),
      ),
    ),
  );
  // The running banner and timeline pulse animate forever: never settle.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

OrderStatus _order(String status) {
  return OrderStatus(
    id: 'DD-1',
    status: status,
    tier: 'standard',
    createdAt: DateTime.now().toIso8601String(),
    topic: 'Research a useful topic',
    reportPath: status == 'done' ? '/reports/DD-1.html' : null,
    progress: [
      ProgressLine(DateTime.now().toIso8601String(), 'Research started'),
      ProgressLine(DateTime.now().toIso8601String(), 'USDC hidden progress'),
      ProgressLine(DateTime.now().toIso8601String(), 'Research complete'),
    ],
  );
}

void main() {
  testWidgets('running status shows activity and email notice', (tester) async {
    await _pump(tester, _order('running'));
    expect(find.text('The agent is researching'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(
      find.text('We will also email you when it is ready.'),
      findsOneWidget,
    );
    expect(find.textContaining('USDC'), findsNothing);
  });

  testWidgets('done status has report action', (tester) async {
    await _pump(tester, _order('done'));
    expect(find.text('Your report is ready'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'View report'), findsOneWidget);
  });

  testWidgets('failed status offers report-issue and order-again', (
    tester,
  ) async {
    await _pump(tester, _order('failed'));
    expect(find.text("We couldn't finish this research"), findsOneWidget);
    expect(find.text('Report an issue'), findsOneWidget);
    expect(find.text('Order again'), findsOneWidget);
  });

  // ProviderScope overrides are fixed per pumpWidget, so each state gets its own test.
  testWidgets('awaiting_payment status offers purchase restore', (
    tester,
  ) async {
    await _pump(tester, _order('awaiting_payment'));
    expect(find.text('Payment not confirmed yet'), findsOneWidget);
    expect(find.text('Restore unfinished purchases'), findsOneWidget);
  });
}

import 'dart:convert';
import 'package:deepdesk_app/providers.dart';
import 'package:deepdesk_app/screens/history_screen.dart';
import 'package:deepdesk_app/theme/app_theme.dart';
import 'package:deepdesk_app/widgets/empty_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _pump(WidgetTester tester, Map<String, Object> values) async {
  SharedPreferences.setMockInitialValues(values);
  final prefs = await SharedPreferences.getInstance();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      child: MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('en'),
        home: const HistoryScreen(),
      ),
    ),
  );
}

void main() {
  testWidgets('empty history uses an empty state with the order CTA', (
    tester,
  ) async {
    await _pump(tester, {});
    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.text('Start a research order'), findsOneWidget);
  });

  testWidgets('orders are newest first with status badges', (tester) async {
    await _pump(tester, {
      'orders': jsonEncode([
        {
          'id': 'older',
          'topic': 'Older research',
          'tier': 'light',
          'createdAt': DateTime.now()
              .subtract(const Duration(days: 2))
              .toIso8601String(),
          'lastStatus': 'running',
        },
        {
          'id': 'newer',
          'topic': 'Newer research',
          'tier': 'standard',
          'createdAt': DateTime.now().toIso8601String(),
          'lastStatus': 'done',
        },
      ]),
    });
    expect(find.text('Newer research'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);
    expect(find.text('Researching'), findsOneWidget);
    final newer = tester.getTopLeft(find.text('Newer research'));
    final older = tester.getTopLeft(find.text('Older research'));
    expect(newer.dy, lessThan(older.dy));
  });
}

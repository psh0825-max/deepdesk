import 'package:deepdesk_app/l10n/strings.dart';
import 'package:deepdesk_app/util/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('formatClock formats valid input and preserves invalid input', () {
    expect(
      formatClock('2026-01-02T03:04:00Z'),
      matches(RegExp(r'^\d{2}:\d{2}$')),
    );
    expect(formatClock('not-a-date'), 'not-a-date');
  });

  test('formatRelative selects relative and date output', () {
    final s = AppStrings.testing(false);
    expect(formatRelative(DateTime.now().toIso8601String(), s), 'Just now');
    expect(
      formatRelative(
        DateTime.now().subtract(const Duration(minutes: 2)).toIso8601String(),
        s,
      ),
      '2 min ago',
    );
    expect(
      formatRelative(
        DateTime.now().subtract(const Duration(hours: 2)).toIso8601String(),
        s,
      ),
      '2h ago',
    );
    expect(
      formatRelative(
        DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
        s,
      ),
      '2d ago',
    );
    expect(
      formatRelative(
        DateTime.now().subtract(const Duration(days: 8)).toIso8601String(),
        s,
      ),
      matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')),
    );
  });

  test('AppStrings replaces template tokens', () {
    final s = AppStrings.testing(false);
    expect(s.fmt('minutesAgo', {'n': 3}), '3 min ago');
  });
}

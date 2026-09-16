import 'package:flutter_test/flutter_test.dart';

/// Drags [scrollable] until [finder] matches at least one widget.
///
/// `scrollUntilVisible` needs exactly one match once found; lazily built lists
/// (ListView / CustomScrollView) produce zero matches before and several after,
/// so this helper only waits for the widgets to exist.
Future<void> scrollUntilFound(
  WidgetTester tester,
  Finder finder,
  Finder scrollable, {
  int maxScrolls = 30,
  double step = 300,
}) async {
  for (var i = 0; i < maxScrolls && finder.evaluate().isEmpty; i++) {
    await tester.drag(scrollable, Offset(0, -step));
    await tester.pumpAndSettle();
  }
  expect(finder, findsAtLeastNWidgets(1));
}

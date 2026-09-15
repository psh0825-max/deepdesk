import 'package:deepdesk_app/services/order_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('adds updates newest first and caps at 50', () async {
    SharedPreferences.setMockInitialValues({});
    final s = OrderStore(await SharedPreferences.getInstance());
    for (var i = 0; i < 51; i++) {
      await s.addOrUpdate(
        LocalOrder(
          id: '$i',
          topic: 't$i',
          tier: 'light',
          createdAt: '2026-01-${i.toString().padLeft(2, '0')}',
          lastStatus: 'queued',
        ),
      );
    }
    expect(s.getAll(), hasLength(50));
    expect(s.get('50'), isNotNull);
    await s.addOrUpdate(
      LocalOrder(
        id: '50',
        topic: 'new',
        tier: 'light',
        createdAt: '2026-12-01',
        lastStatus: 'done',
      ),
    );
    expect(s.get('50')!.lastStatus, 'done');
    expect(s.getAll().first.id, '50');
  });
}

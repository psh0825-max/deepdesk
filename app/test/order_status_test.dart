import 'dart:async';

import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('progress filter removes prohibited payment line', () {
    final lines = [
      ProgressLine('a', 'visible'),
      ProgressLine('b', 'USDC line'),
    ].where((p) => !p.message.toUpperCase().contains('USDC')).toList();
    expect(lines.map((x) => x.message), ['visible']);
  });

  test('polling emits running then done and stops after completion', () async {
    var requests = 0;
    final api = ApiClient(
      baseUrl: 'https://x',
      client: MockClient((_) async {
        requests++;
        final status = requests == 1 ? 'running' : 'done';
        return http.Response(
          '{"id":"order-1","status":"$status","tier":"light",'
          '"createdAt":"now","topic":"topic","progress":[]}',
          200,
        );
      }),
    );
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        pollIntervalProvider.overrideWithValue(const Duration(milliseconds: 1)),
      ],
    );
    addTearDown(container.dispose);
    final statuses = <String>[];
    final completed = Completer<void>();
    final subscription = container.listen<AsyncValue<OrderStatus>>(
      orderStatusProvider('order-1'),
      (_, next) {
        next.whenData((order) {
          statuses.add(order.status);
          if (order.terminal && !completed.isCompleted) {
            completed.complete();
          }
        });
      },
      fireImmediately: true,
    );
    addTearDown(subscription.close);

    await completed.future.timeout(const Duration(seconds: 1));
    final requestsAtCompletion = requests;
    await Future<void>.delayed(const Duration(milliseconds: 20));

    expect(statuses, ['running', 'done']);
    expect(requestsAtCompletion, 2);
    expect(requests, requestsAtCompletion);
  });
}

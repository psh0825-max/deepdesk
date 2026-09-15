import 'dart:io';
import 'package:deepdesk_app/services/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('config parses tiers, products, and product fallback', () async {
    final api = ApiClient(
      baseUrl: 'https://x',
      client: MockClient(
        (_) async => http.Response(
          '{"tiers":{"light":{"label":"Light","pages":"7","hours":24}},"iap":{"products":{"light":"p"}}}',
          200,
        ),
      ),
    );
    final c = await api.getConfig();
    expect(c.tiers['light']!.hours, 24);
    expect(c.productIds['light'], 'p');
    expect(c.productIds['deep'], 'deepdesk_deep');
  });
  test('create order and errors retain server message', () async {
    final ok = ApiClient(
      baseUrl: 'https://x',
      client: MockClient(
        (_) async =>
            http.Response('{"id":"o1","status":"awaiting_payment"}', 200),
      ),
    );
    expect(
      (await ok.createOrder(
        topic: 'topic!',
        brief: '',
        email: 'a@b.com',
        tier: 'light',
        language: 'en',
        payMethod: 'iap_android',
      )).id,
      'o1',
    );
    final bad = ApiClient(
      baseUrl: 'https://x',
      client: MockClient(
        (_) async => http.Response('{"error":"bad topic"}', 400),
      ),
    );
    expect(
      () => bad.createOrder(
        topic: 'x',
        brief: '',
        email: 'a@b.com',
        tier: 'light',
        language: 'en',
        payMethod: 'iap_android',
      ),
      throwsA(
        isA<DeepDeskApiException>().having(
          (e) => e.message,
          'message',
          'bad topic',
        ),
      ),
    );
  });
  test('confirm maps 402, 409, and 400 errors', () async {
    for (final code in [402, 409, 400]) {
      final a = ApiClient(
        baseUrl: 'https://x',
        client: MockClient(
          (_) async => http.Response(
            code == 409
                ? '{"error":"token_reused"}'
                : '{"error":"verification_failed"}',
            code,
          ),
        ),
      );
      expect(
        () => a.confirmPurchase(
          orderId: 'o',
          platform: 'android',
          productId: 'p',
          purchaseToken: 't',
        ),
        throwsA(isA<DeepDeskApiException>()),
      );
    }
  });
  test('get order parses progress', () async {
    final a = ApiClient(
      baseUrl: 'https://x',
      client: MockClient(
        (_) async => http.Response(
          '{"id":"o","status":"done","tier":"light","createdAt":"now","topic":"topic","progress":[{"at":"a","message":"m"}]}',
          200,
        ),
      ),
    );

    final o = await a.getOrder('o');

    expect(o.progress.single.message, 'm');
  });

  test('retries once on SocketException', () async {
    var n = 0;
    final a = ApiClient(
      baseUrl: 'https://x',
      client: MockClient((_) {
        if (n++ == 0) throw const SocketException('offline');
        return Future.value(
          http.Response(
            '{"id":"o","status":"done","tier":"light","createdAt":"now","topic":"topic","progress":[{"at":"a","message":"m"}]}',
            200,
          ),
        );
      }),
    );
    await a.getOrder('o');

    expect(n, 2);
  });
}

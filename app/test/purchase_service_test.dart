import 'dart:async';
import 'dart:convert';

import 'package:deepdesk_app/services/api_client.dart';
import 'package:deepdesk_app/services/purchase_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeStore implements StoreGateway {
  final events = StreamController<List<PurchaseDetails>>();
  int completed = 0;
  int finished = 0;
  int restoreCalls = 0;
  bool? autoConsume;
  PurchaseParam? purchaseParam;

  @override
  Stream<List<PurchaseDetails>> get purchaseStream => events.stream;

  @override
  Future<bool> isAvailable() async => true;

  @override
  Future<ProductDetailsResponse> queryProductDetails(Set<String> ids) async {
    return ProductDetailsResponse(productDetails: [], notFoundIDs: []);
  }

  @override
  Future<bool> buyConsumable({
    required PurchaseParam purchaseParam,
    bool autoConsume = true,
  }) async {
    this.purchaseParam = purchaseParam;
    this.autoConsume = autoConsume;
    return true;
  }

  @override
  Future<void> completePurchase(PurchaseDetails purchase) async {
    completed++;
  }

  @override
  Future<void> finishPurchase(PurchaseDetails purchase) async {
    finished++;
  }

  @override
  Future<void> restorePurchases() async {
    restoreCalls++;
  }
}

PurchaseDetails detail(PurchaseStatus status) {
  final purchase = PurchaseDetails(
    productID: 'deepdesk_light',
    verificationData: PurchaseVerificationData(
      localVerificationData: 't',
      serverVerificationData: 'token',
      source: 'test',
    ),
    transactionDate: '1',
    status: status,
  );
  purchase.pendingCompletePurchase = true;
  return purchase;
}

ProductDetails product() {
  return ProductDetails(
    id: 'deepdesk_light',
    title: 'Light',
    description: 'Light research',
    price: '₩4,900',
    rawPrice: 4900,
    currencyCode: 'KRW',
  );
}

Future<SharedPreferences> prefsWithPendingOrder() async {
  SharedPreferences.setMockInitialValues({
    'pending_orders': '{"deepdesk_light":"order-1"}',
  });
  return SharedPreferences.getInstance();
}

void main() {
  test('purchased confirms then finishes a restored purchase', () async {
    final store = FakeStore();
    final api = ApiClient(
      baseUrl: 'https://x',
      client: MockClient((_) async => http.Response('{"status":"paid"}', 200)),
    );
    final service = PurchaseService(
      gateway: store,
      api: api,
      prefs: await prefsWithPendingOrder(),
      platform: () => 'android',
    );

    final outcome = service.outcomes.first;
    store.events.add([detail(PurchaseStatus.restored)]);

    expect((await outcome).orderId, 'order-1');
    expect(store.finished, 1);
    expect(store.completed, 0);

    await service.dispose();
    await store.events.close();
  });

  test('verification failure leaves purchase unfinished', () async {
    final store = FakeStore();
    final api = ApiClient(
      baseUrl: 'https://x',
      client: MockClient(
        (_) async => http.Response('{"error":"verification_failed"}', 402),
      ),
    );
    final service = PurchaseService(
      gateway: store,
      api: api,
      prefs: await prefsWithPendingOrder(),
      platform: () => 'android',
    );

    final outcome = service.outcomes.first;
    store.events.add([detail(PurchaseStatus.purchased)]);

    expect((await outcome).type, 'failed');
    expect(store.finished, 0);
    expect(store.completed, 0);

    await service.dispose();
    await store.events.close();
  });

  test('token_reused response finishes the purchase once', () async {
    final store = FakeStore();
    final api = ApiClient(
      baseUrl: 'https://x',
      client: MockClient(
        (_) async => http.Response('{"error":"token_reused"}', 409),
      ),
    );
    final service = PurchaseService(
      gateway: store,
      api: api,
      prefs: await prefsWithPendingOrder(),
      platform: () => 'android',
    );

    final outcome = service.outcomes.first;
    store.events.add([detail(PurchaseStatus.purchased)]);

    expect((await outcome).type, 'reusedToken');
    expect(store.finished, 1);
    expect(store.completed, 0);

    await service.dispose();
    await store.events.close();
  });

  test(
    'canceled purchase removes its pending order without finishing',
    () async {
      final store = FakeStore();
      final prefs = await prefsWithPendingOrder();
      final service = PurchaseService(
        gateway: store,
        api: ApiClient(baseUrl: 'https://x'),
        prefs: prefs,
        platform: () => 'android',
      );

      final outcome = service.outcomes.first;
      store.events.add([detail(PurchaseStatus.canceled)]);

      expect((await outcome).type, 'canceled');
      expect(prefs.getString('pending_orders'), '{}');
      expect(store.finished, 0);

      await service.dispose();
      await store.events.close();
    },
  );

  test(
    'Android purchases disable auto-consume and embed the order id',
    () async {
      SharedPreferences.setMockInitialValues({});
      final store = FakeStore();
      final service = PurchaseService(
        gateway: store,
        api: ApiClient(baseUrl: 'https://x'),
        prefs: await SharedPreferences.getInstance(),
        platform: () => 'android',
      );

      await service.buy(product(), 'order-1');

      expect(store.autoConsume, isFalse);
      expect(store.purchaseParam, isA<GooglePlayPurchaseParam>());
      expect(store.purchaseParam!.applicationUserName, 'order-1');

      await service.dispose();
      await store.events.close();
    },
  );

  test('embedded order id takes precedence over the pending map', () async {
    String? confirmedOrderId;
    final store = FakeStore();
    final api = ApiClient(
      baseUrl: 'https://x',
      client: MockClient((request) async {
        confirmedOrderId =
            (jsonDecode(request.body) as Map)['orderId'] as String?;
        return http.Response('{"status":"paid"}', 200);
      }),
    );
    final service = PurchaseService(
      gateway: store,
      api: api,
      prefs: await prefsWithPendingOrder(),
      platform: () => 'android',
      embeddedOrderId: (_) => 'order-embedded',
    );

    final outcome = service.outcomes.first;
    store.events.add([detail(PurchaseStatus.purchased)]);

    expect((await outcome).orderId, 'order-embedded');
    expect(confirmedOrderId, 'order-embedded');

    await service.dispose();
    await store.events.close();
  });

  test('recoverUnfinished restores only on Android', () async {
    SharedPreferences.setMockInitialValues({});
    final androidStore = FakeStore();
    final iosStore = FakeStore();
    final prefs = await SharedPreferences.getInstance();
    final android = PurchaseService(
      gateway: androidStore,
      api: ApiClient(baseUrl: 'https://x'),
      prefs: prefs,
      platform: () => 'android',
    );
    final ios = PurchaseService(
      gateway: iosStore,
      api: ApiClient(baseUrl: 'https://x'),
      prefs: prefs,
      platform: () => 'ios',
    );

    await android.recoverUnfinished();
    await ios.recoverUnfinished();

    expect(androidStore.restoreCalls, 1);
    expect(iosStore.restoreCalls, 0);

    await android.dispose();
    await ios.dispose();
    await androidStore.events.close();
    await iosStore.events.close();
  });
}

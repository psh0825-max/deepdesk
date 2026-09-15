import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'services/api_client.dart';
import 'services/order_store.dart';
import 'services/purchase_service.dart';

final sharedPreferencesProvider = Provider<SharedPreferences>(
  (_) => throw UnimplementedError(),
);
final apiClientProvider = Provider<ApiClient>((_) => ApiClient());
final orderStoreProvider = Provider<OrderStore>(
  (ref) => OrderStore(ref.watch(sharedPreferencesProvider)),
);
final configProvider = FutureProvider<ServerConfig>(
  (ref) => ref.watch(apiClientProvider).getConfig(),
);
final purchaseServiceProvider = Provider<PurchaseService>((ref) {
  final s = PurchaseService(
    api: ref.watch(apiClientProvider),
    prefs: ref.watch(sharedPreferencesProvider),
  );
  ref.onDispose(s.dispose);
  return s;
});
final productsProvider = FutureProvider<List<ProductDetails>>((ref) async {
  final config = await ref.watch(configProvider.future);
  return ref
      .watch(purchaseServiceProvider)
      .loadProducts(config.productIds.values.toSet());
});
final pollIntervalProvider = Provider<Duration>(
  (_) => const Duration(seconds: 5),
);
final orderStatusProvider = StreamProvider.family<OrderStatus, String>((
  ref,
  id,
) async* {
  final api = ref.watch(apiClientProvider);
  final pollInterval = ref.watch(pollIntervalProvider);
  while (true) {
    final order = await api.getOrder(id);
    yield order;
    if (order.terminal) return;
    await Future<void>.delayed(pollInterval);
  }
});

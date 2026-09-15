import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';
import 'package:in_app_purchase_platform_interface/in_app_purchase_platform_interface.dart';
import 'package:in_app_purchase_storekit/in_app_purchase_storekit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';

abstract class StoreGateway {
  Stream<List<PurchaseDetails>> get purchaseStream;
  Future<bool> isAvailable();
  Future<ProductDetailsResponse> queryProductDetails(Set<String> ids);
  Future<bool> buyConsumable({
    required PurchaseParam purchaseParam,
    bool autoConsume = true,
  });
  Future<void> completePurchase(PurchaseDetails purchase);
  Future<void> finishPurchase(PurchaseDetails purchase);
  Future<void> restorePurchases();
}

class IapStoreGateway implements StoreGateway {
  IapStoreGateway(this._iap);
  final InAppPurchase _iap;
  @override
  Stream<List<PurchaseDetails>> get purchaseStream => _iap.purchaseStream;
  @override
  Future<bool> isAvailable() => _iap.isAvailable();
  @override
  Future<ProductDetailsResponse> queryProductDetails(Set<String> ids) =>
      _iap.queryProductDetails(ids);
  @override
  Future<bool> buyConsumable({
    required PurchaseParam purchaseParam,
    bool autoConsume = true,
  }) => _iap.buyConsumable(
    purchaseParam: purchaseParam,
    autoConsume: autoConsume,
  );
  @override
  Future<void> completePurchase(PurchaseDetails purchase) =>
      _iap.completePurchase(purchase);
  @override
  Future<void> finishPurchase(PurchaseDetails purchase) async {
    if (Platform.isAndroid) {
      final addition =
          InAppPurchasePlatformAddition.instance
              as InAppPurchaseAndroidPlatformAddition;
      await addition.consumePurchase(purchase);
      return;
    }
    await _iap.completePurchase(purchase);
  }

  @override
  Future<void> restorePurchases() => _iap.restorePurchases();
}

class PurchaseOutcome {
  const PurchaseOutcome._(this.type, this.orderId, [this.message]);
  final String type;
  final String? orderId;
  final String? message;
  factory PurchaseOutcome.confirmed(String id) =>
      PurchaseOutcome._('confirmed', id);
  factory PurchaseOutcome.failed(String message) =>
      PurchaseOutcome._('failed', null, message);
  factory PurchaseOutcome.reusedToken(String id) =>
      PurchaseOutcome._('reusedToken', id);
  factory PurchaseOutcome.canceled() =>
      const PurchaseOutcome._('canceled', null);
  factory PurchaseOutcome.pending() => const PurchaseOutcome._('pending', null);
}

class PurchaseService {
  PurchaseService({
    StoreGateway? gateway,
    required ApiClient api,
    required SharedPreferences prefs,
    String Function()? platform,
    String? Function(PurchaseDetails)? embeddedOrderId,
  }) : _gateway = gateway ?? IapStoreGateway(InAppPurchase.instance),
       _api = api,
       _prefs = prefs,
       _platform = platform ?? (() => Platform.isIOS ? 'ios' : 'android'),
       _embeddedOrderId = embeddedOrderId ?? _defaultEmbeddedOrderId {
    _sub = _gateway.purchaseStream.listen(
      _onPurchases,
      onError: (Object e) =>
          _outcomes.add(PurchaseOutcome.failed(e.toString())),
    );
  }
  final StoreGateway _gateway;
  final ApiClient _api;
  final SharedPreferences _prefs;
  final String Function() _platform;
  final String? Function(PurchaseDetails) _embeddedOrderId;
  final _outcomes = StreamController<PurchaseOutcome>.broadcast();
  late final StreamSubscription<List<PurchaseDetails>> _sub;
  Stream<PurchaseOutcome> get outcomes => _outcomes.stream;
  Future<List<ProductDetails>> loadProducts(Set<String> ids) async {
    if (!await _gateway.isAvailable()) return const [];
    final r = await _gateway.queryProductDetails(ids);
    return r.error == null ? r.productDetails : const [];
  }

  Future<void> buy(ProductDetails product, String orderId) async {
    final map = _pending;
    map[product.id] = orderId;
    await _savePending(map);
    final purchaseParam = _platform() == 'ios'
        ? AppStorePurchaseParam(
            productDetails: product,
            applicationUserName: orderId,
          )
        : GooglePlayPurchaseParam(
            productDetails: product,
            applicationUserName: orderId,
          );
    await _gateway.buyConsumable(
      purchaseParam: purchaseParam,
      autoConsume: false,
    );
  }

  Future<void> restore() => _gateway.restorePurchases();
  Future<void> recoverUnfinished() async {
    if (_platform() == 'android') {
      await _gateway.restorePurchases();
    }
  }

  static String? _defaultEmbeddedOrderId(PurchaseDetails purchase) {
    try {
      if (purchase is GooglePlayPurchaseDetails) {
        return purchase.billingClientPurchase.obfuscatedAccountId;
      }
      if (purchase is AppStorePurchaseDetails) {
        return purchase.skPaymentTransaction.payment.applicationUsername;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  Map<String, String> get _pending {
    final raw = _prefs.getString('pending_orders');
    if (raw == null) return {};
    try {
      return (Map<String, dynamic>.from(
        jsonDecode(raw) as Map,
      )).map((k, v) => MapEntry(k, v.toString()));
    } catch (_) {
      return {};
    }
  }

  Future<void> _savePending(Map<String, String> value) =>
      _prefs.setString('pending_orders', jsonEncode(value));
  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final p in purchases) {
      switch (p.status) {
        case PurchaseStatus.pending:
          _outcomes.add(PurchaseOutcome.pending());
          break;
        case PurchaseStatus.canceled:
          await _remove(p.productID);
          _outcomes.add(PurchaseOutcome.canceled());
          break;
        case PurchaseStatus.error:
          _outcomes.add(
            PurchaseOutcome.failed(p.error?.message ?? 'Purchase error'),
          );
          break;
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          await _confirm(p);
          break;
      }
    }
  }

  Future<void> _confirm(PurchaseDetails p) async {
    final orderId = _embeddedOrderId(p) ?? _pending[p.productID];
    if (orderId == null) {
      _outcomes.add(PurchaseOutcome.failed('noMatchingOrder'));
      return;
    }
    final platform = _platform();
    try {
      await _api.confirmPurchase(
        orderId: orderId,
        platform: platform,
        productId: p.productID,
        purchaseToken: platform == 'android'
            ? p.verificationData.serverVerificationData
            : null,
        receipt: platform == 'ios'
            ? p.verificationData.serverVerificationData
            : null,
      );
      if (p.pendingCompletePurchase) await _gateway.finishPurchase(p);
      await _remove(p.productID);
      _outcomes.add(PurchaseOutcome.confirmed(orderId));
    } on DeepDeskApiException catch (e) {
      if (e.statusCode == 409 || e.code == 'token_reused') {
        if (p.pendingCompletePurchase) await _gateway.finishPurchase(p);
        await _remove(p.productID);
        _outcomes.add(PurchaseOutcome.reusedToken(orderId));
      } else {
        _outcomes.add(PurchaseOutcome.failed(e.message));
      }
    } catch (e) {
      _outcomes.add(PurchaseOutcome.failed(e.toString()));
    }
  }

  Future<void> _remove(String productId) async {
    final m = _pending;
    m.remove(productId);
    await _savePending(m);
  }

  Future<void> dispose() async {
    await _sub.cancel();
    await _outcomes.close();
  }
}

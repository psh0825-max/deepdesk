import 'dart:async';
import 'package:deepdesk_app/services/purchase_service.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

class FakeStoreGateway implements StoreGateway {
  final events = StreamController<List<PurchaseDetails>>();
  var restoreCalls = 0;

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
    return true;
  }

  @override
  Future<void> completePurchase(PurchaseDetails purchase) async {}

  @override
  Future<void> finishPurchase(PurchaseDetails purchase) async {}

  @override
  Future<void> restorePurchases() async {
    restoreCalls++;
  }
}

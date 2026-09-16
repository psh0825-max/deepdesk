import 'package:deepdesk_app/services/api_client.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

ServerConfig testConfig() {
  return ServerConfig(
    tiers: {
      'light': TierInfo(
        id: 'light',
        label: 'Light',
        pages: '7 pages',
        hours: 24,
      ),
      'standard': TierInfo(
        id: 'standard',
        label: 'Standard',
        pages: '15 pages',
        hours: 48,
      ),
      'deep': TierInfo(id: 'deep', label: 'Deep', pages: '30 pages', hours: 72),
    },
    productIds: const {
      'light': 'deepdesk_light',
      'standard': 'deepdesk_standard',
      'deep': 'deepdesk_deep',
    },
  );
}

List<ProductDetails> testProducts() {
  return [
    ProductDetails(
      id: 'deepdesk_light',
      title: 'Light',
      description: 'Light research',
      price: '\$3.49',
      rawPrice: 3.49,
      currencyCode: 'USD',
    ),
    ProductDetails(
      id: 'deepdesk_standard',
      title: 'Standard',
      description: 'Standard research',
      price: '\$9.99',
      rawPrice: 9.99,
      currencyCode: 'USD',
    ),
    ProductDetails(
      id: 'deepdesk_deep',
      title: 'Deep',
      description: 'Deep research',
      price: '\$19.99',
      rawPrice: 19.99,
      currencyCode: 'USD',
    ),
  ];
}

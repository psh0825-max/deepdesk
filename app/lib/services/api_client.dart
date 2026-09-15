// ignore_for_file: use_null_aware_elements
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../core/config.dart';

class DeepDeskApiException implements Exception {
  DeepDeskApiException(this.statusCode, this.code, this.message);
  final int statusCode;
  final String code;
  final String message;
  @override
  String toString() => message;
}

class TierInfo {
  TierInfo({
    required this.id,
    required this.label,
    required this.pages,
    required this.hours,
  });
  final String id, label, pages;
  final int hours;
}

class ServerConfig {
  ServerConfig({required this.tiers, required this.productIds});
  final Map<String, TierInfo> tiers;
  final Map<String, String> productIds;
}

class CreatedOrder {
  CreatedOrder(this.id, this.status);
  final String id, status;
}

class ProgressLine {
  ProgressLine(this.at, this.message);
  final String at, message;
}

class OrderStatus {
  OrderStatus({
    required this.id,
    required this.status,
    required this.tier,
    required this.createdAt,
    required this.topic,
    this.reportPath,
    this.tierLabel,
    this.price,
    required this.progress,
  });
  final String id, status, tier, createdAt, topic;
  final String? reportPath, tierLabel;
  final num? price;
  final List<ProgressLine> progress;
  bool get terminal => status == 'done' || status == 'failed';
}

class ApiClient {
  ApiClient({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      baseUrl = (baseUrl ?? AppConfig.baseUrl).replaceFirst(RegExp(r'/$'), '');
  final http.Client _client;
  final String baseUrl;
  Future<ServerConfig> getConfig() async {
    final data = await _getJson('/api/config');
    final rawTiers = data['tiers'] as Map<String, dynamic>? ?? {};
    final tiers = <String, TierInfo>{};
    rawTiers.forEach((id, raw) {
      final t = raw as Map<String, dynamic>;
      tiers[id] = TierInfo(
        id: id,
        label: (t['label'] ?? id).toString(),
        pages: (t['pages'] ?? '').toString(),
        hours: (t['hours'] as num?)?.toInt() ?? 0,
      );
    });
    final products = Map<String, String>.from(AppConfig.productFallbacks);
    final iap = data['iap'] as Map<String, dynamic>?;
    final p = iap?['products'] as Map<String, dynamic>?;
    if (p != null) {
      p.forEach((k, v) {
        if (v is String && v.isNotEmpty) products[k] = v;
      });
    }
    return ServerConfig(tiers: tiers, productIds: products);
  }

  Future<CreatedOrder> createOrder({
    required String topic,
    required String brief,
    required String email,
    required String tier,
    required String language,
    required String payMethod,
  }) async {
    final d = await _post('/api/orders', {
      'topic': topic,
      'brief': brief,
      'email': email,
      'tier': tier,
      'language': language,
      'payMethod': payMethod,
    });
    return CreatedOrder(d['id'].toString(), d['status'].toString());
  }

  Future<String> confirmPurchase({
    required String orderId,
    required String platform,
    required String productId,
    String? purchaseToken,
    String? receipt,
  }) async {
    final d = await _post('/api/iap/confirm', {
      'orderId': orderId,
      'platform': platform,
      'productId': productId,
      if (purchaseToken != null) 'purchaseToken': purchaseToken,
      if (receipt != null) 'receipt': receipt,
    });
    return d['status'].toString();
  }

  Future<OrderStatus> getOrder(String id) async {
    final d = await _getJson('/api/orders/$id');
    final lines = ((d['progress'] as List?) ?? []).map((e) {
      final m = e as Map<String, dynamic>;
      return ProgressLine(
        (m['at'] ?? '').toString(),
        (m['message'] ?? '').toString(),
      );
    }).toList();
    return OrderStatus(
      id: d['id'].toString(),
      status: d['status'].toString(),
      tier: d['tier'].toString(),
      createdAt: (d['createdAt'] ?? '').toString(),
      topic: (d['topic'] ?? '').toString(),
      reportPath: d['reportPath']?.toString(),
      tierLabel: d['tierLabel']?.toString(),
      price: d['price'] as num?,
      progress: lines,
    );
  }

  Future<Map<String, dynamic>> _getJson(String path) async {
    for (var n = 0; ; n++) {
      try {
        final r = await _client
            .get(Uri.parse('$baseUrl$path'))
            .timeout(const Duration(seconds: 45));
        return _decode(r);
      } on SocketException {
        if (n == 0) continue;
        rethrow;
      } on TimeoutException {
        if (n == 0) continue;
        rethrow;
      }
    }
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final r = await _client
        .post(
          Uri.parse('$baseUrl$path'),
          headers: {'content-type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 45));
    return _decode(r);
  }

  Map<String, dynamic> _decode(http.Response r) {
    final d = (jsonDecode(r.body) as Map).cast<String, dynamic>();
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw DeepDeskApiException(
        r.statusCode,
        (d['error'] ?? 'http_error').toString(),
        (d['message'] ?? d['reason'] ?? d['error'] ?? 'Request failed')
            .toString(),
      );
    }
    return d;
  }
}

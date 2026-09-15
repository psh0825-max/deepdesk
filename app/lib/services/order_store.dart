// ignore_for_file: curly_braces_in_flow_control_structures
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class LocalOrder {
  LocalOrder({
    required this.id,
    required this.topic,
    required this.tier,
    required this.createdAt,
    required this.lastStatus,
  });
  final String id, topic, tier, createdAt, lastStatus;
  Map<String, dynamic> toJson() => {
    'id': id,
    'topic': topic,
    'tier': tier,
    'createdAt': createdAt,
    'lastStatus': lastStatus,
  };
  factory LocalOrder.fromJson(Map<String, dynamic> j) => LocalOrder(
    id: j['id'].toString(),
    topic: j['topic'].toString(),
    tier: j['tier'].toString(),
    createdAt: j['createdAt'].toString(),
    lastStatus: j['lastStatus'].toString(),
  );
  LocalOrder copyWith({String? lastStatus}) => LocalOrder(
    id: id,
    topic: topic,
    tier: tier,
    createdAt: createdAt,
    lastStatus: lastStatus ?? this.lastStatus,
  );
}

class OrderStore {
  OrderStore(this._prefs);
  final SharedPreferences _prefs;
  List<LocalOrder> getAll() {
    final raw = _prefs.getString('orders');
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List)
          .map((e) => LocalOrder.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> addOrUpdate(LocalOrder order) async {
    final all = getAll().where((o) => o.id != order.id).toList()..add(order);
    all.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    await _prefs.setString(
      'orders',
      jsonEncode(all.take(50).map((o) => o.toJson()).toList()),
    );
  }

  LocalOrder? get(String id) {
    for (final o in getAll()) if (o.id == id) return o;
    return null;
  }
}

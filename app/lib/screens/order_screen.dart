// ignore_for_file: deprecated_member_use, unnecessary_underscores
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../l10n/strings.dart';
import '../providers.dart';
import '../services/api_client.dart';
import '../services/order_store.dart';
import 'about_screen.dart';
import 'history_screen.dart';
import 'order_status_screen.dart';

class OrderScreen extends ConsumerStatefulWidget {
  const OrderScreen({super.key});
  @override
  ConsumerState<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends ConsumerState<OrderScreen> {
  static bool _recoveredUnfinishedPurchases = false;
  final _topic = TextEditingController(),
      _brief = TextEditingController(),
      _email = TextEditingController();
  String _tier = 'standard', _language = 'en';
  StreamSubscription? _sub;
  bool _waiting = false;
  @override
  void initState() {
    super.initState();
    _email.text = ref.read(sharedPreferencesProvider).getString('email') ?? '';
    _language = Platform.localeName.toLowerCase().startsWith('ko')
        ? 'ko'
        : 'en';
    _sub = ref.read(purchaseServiceProvider).outcomes.listen(_outcome);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_recoveredUnfinishedPurchases) {
        return;
      }
      _recoveredUnfinishedPurchases = true;
      unawaited(ref.read(purchaseServiceProvider).recoverUnfinished());
    });
  }

  void _outcome(dynamic o) {
    if (!mounted) return;
    if (o.type == 'pending') {
      setState(() => _waiting = true);
      return;
    }
    if (o.type == 'confirmed' || o.type == 'reusedToken') {
      setState(() => _waiting = false);
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => OrderStatusScreen(orderId: o.orderId),
        ),
      );
      return;
    }
    setState(() => _waiting = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          o.message == null
              ? AppStrings.of(context)[o.type]
              : AppStrings.of(context)[o.message],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _sub?.cancel();
    _topic.dispose();
    _brief.dispose();
    _email.dispose();
    super.dispose();
  }

  bool get _valid =>
      _topic.text.trim().length >= 5 &&
      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim());
  Future<void> _submit(ServerConfig c, List<ProductDetails> products) async {
    final s = AppStrings.of(context);
    final product = products
        .where((p) => p.id == c.productIds[_tier])
        .firstOrNull;
    if (product == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(s['productsUnavailable'])));
      return;
    }
    try {
      final created = await ref
          .read(apiClientProvider)
          .createOrder(
            topic: _topic.text.trim(),
            brief: _brief.text.trim(),
            email: _email.text.trim(),
            tier: _tier,
            language: _language,
            payMethod: Platform.isIOS ? 'iap_ios' : 'iap_android',
          );
      await ref
          .read(sharedPreferencesProvider)
          .setString('email', _email.text.trim());
      await ref
          .read(orderStoreProvider)
          .addOrUpdate(
            LocalOrder(
              id: created.id,
              topic: _topic.text.trim(),
              tier: _tier,
              createdAt: DateTime.now().toIso8601String(),
              lastStatus: created.status,
            ),
          );
      setState(() => _waiting = true);
      await ref.read(purchaseServiceProvider).buy(product, created.id);
    } catch (e) {
      if (mounted) {
        setState(() => _waiting = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final config = ref.watch(configProvider);
    final products = ref.watch(productsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('DeepDesk'),
        actions: [
          IconButton(
            tooltip: s['history'],
            icon: const Icon(Icons.history),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const HistoryScreen()),
            ),
          ),
          IconButton(
            tooltip: s['about'],
            icon: const Icon(Icons.info_outline),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AboutScreen()),
            ),
          ),
        ],
      ),
      body: config.when(
        data: (c) => products.when(
          data: (p) => _body(s, c, p),
          loading: () => Center(child: Text(s['loadingProducts'])),
          error: (_, __) => Center(child: Text(s['productsUnavailable'])),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
      ),
    );
  }

  Widget _body(AppStrings s, ServerConfig c, List<ProductDetails> products) {
    final byId = {for (final p in products) p.id: p};
    return Stack(
      children: [
        ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextField(
              controller: _topic,
              maxLength: 300,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: s['topic']),
            ),
            TextField(
              controller: _brief,
              maxLength: 2000,
              maxLines: 4,
              decoration: InputDecoration(labelText: s['brief']),
            ),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: s['email'],
                helperText: s['emailReason'],
              ),
            ),
            Text(s['language']),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'ko', label: Text(s['korean'])),
                ButtonSegment(value: 'en', label: Text(s['english'])),
              ],
              selected: {_language},
              onSelectionChanged: (x) => setState(() => _language = x.first),
            ),
            ...['light', 'standard', 'deep'].map((id) {
              final t = c.tiers[id];
              final product = byId[c.productIds[id]];
              return Card(
                child: RadioListTile<String>(
                  value: id,
                  groupValue: _tier,
                  onChanged: product == null
                      ? null
                      : (v) => setState(() => _tier = v!),
                  title: Text(t?.label ?? id),
                  subtitle: Text('${t?.pages ?? ''} · ${t?.hours ?? 0}h'),
                  secondary: Text(product?.price ?? s['loadingProducts']),
                ),
              );
            }),
            FilledButton(
              onPressed: _valid && byId.containsKey(c.productIds[_tier])
                  ? () => _submit(c, products)
                  : null,
              child: Text(s['payStart']),
            ),
          ],
        ),
        if (_waiting)
          const ModalBarrier(color: Colors.black54, dismissible: false),
        if (_waiting)
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text(s['purchaseWaiting']),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

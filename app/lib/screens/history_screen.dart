import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/strings.dart';
import '../providers.dart';
import 'order_status_screen.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});
  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final orders = ref.read(orderStoreProvider).getAll();
    return Scaffold(
      appBar: AppBar(title: Text(s['history'])),
      body: orders.isEmpty
          ? Center(child: Text(s['emptyHistory']))
          : ListView.builder(
              itemCount: orders.length,
              itemBuilder: (_, i) {
                final o = orders[i];
                return ListTile(
                  title: Text(o.topic),
                  subtitle: Text('${s[o.lastStatus]} · ${o.createdAt}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => OrderStatusScreen(orderId: o.id),
                    ),
                  ).then((_) => setState(() {})),
                );
              },
            ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/strings.dart';
import '../widgets/content_width.dart';
import '../providers.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/empty_state.dart';
import '../widgets/status_badge.dart';
import 'order_screen.dart';
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
    final orders = ref.read(orderStoreProvider).getAll()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return Scaffold(
      appBar: AppBar(title: Text(s['navReports'])),
      body: ContentWidth(
        child: orders.isEmpty
            ? EmptyState(
                icon: Icons.inbox_outlined,
                title: s['emptyHistory'],
                message: s['emptyHistoryBody'],
                actionLabel: s['ctaOrder'],
                onAction: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const OrderScreen()),
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.all(20),
                itemCount: orders.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, index) =>
                    _orderCard(context, s, orders[index]),
              ),
      ),
    );
  }

  Widget _orderCard(BuildContext context, AppStrings s, dynamic order) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => OrderStatusScreen(orderId: order.id as String),
          ),
        ).then((_) => setState(() {})),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  StatusBadge(status: order.lastStatus as String),
                  const Spacer(),
                  Text(
                    formatRelative(order.createdAt as String, s),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: context.brand.muted,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                order.topic as String,
                style: Theme.of(context).textTheme.titleMedium,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _tierLabel(s, order.tier as String),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.brand.muted,
                      ),
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: context.brand.muted),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _tierLabel(AppStrings s, String tier) {
    return switch (tier) {
      'light' => s['tierLight'],
      'standard' => s['tierStandard'],
      'deep' => s['tierDeep'],
      _ => tier,
    };
  }
}

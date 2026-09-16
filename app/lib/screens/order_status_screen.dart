import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/config.dart';
import '../l10n/strings.dart';
import '../widgets/content_width.dart';
import '../providers.dart';
import '../services/api_client.dart';
import '../services/order_store.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/error_view.dart';
import '../widgets/status_badge.dart';
import '../widgets/timeline.dart';
import 'order_screen.dart';
import 'report_screen.dart';

class OrderStatusScreen extends ConsumerWidget {
  const OrderStatusScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.of(context);
    final state = ref.watch(orderStatusProvider(orderId));
    return Scaffold(
      appBar: AppBar(
        title: Text(s['status']),
        actions: [
          IconButton(
            tooltip: s['refresh'],
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(orderStatusProvider(orderId)),
          ),
        ],
      ),
      body: ContentWidth(
        child: state.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => ErrorView(
            title: s['offlineTitle'],
            message: s['offlineMessage'],
            onRetry: () => ref.invalidate(orderStatusProvider(orderId)),
          ),
          data: (order) => _content(context, ref, s, order),
        ),
      ),
    );
  }

  Widget _content(
    BuildContext context,
    WidgetRef ref,
    AppStrings s,
    OrderStatus order,
  ) {
    ref
        .read(orderStoreProvider)
        .addOrUpdate(
          LocalOrder(
            id: order.id,
            topic: order.topic,
            tier: order.tier,
            createdAt: order.createdAt,
            lastStatus: order.status,
          ),
        );
    final visible = order.progress
        .where((line) => !line.message.toUpperCase().contains('USDC'))
        .toList();
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(orderStatusProvider(orderId)),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _header(context, s, order),
          const SizedBox(height: 16),
          _stateBanner(context, ref, s, order),
          const SizedBox(height: 24),
          Text(
            s['timelineTitle'],
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          if (visible.isEmpty)
            Text(
              s['timelineEmpty'],
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
            )
          else
            ProgressTimeline(
              entries: visible
                  .map(
                    (line) => TimelineEntry(line.message, formatClock(line.at)),
                  )
                  .toList(),
              completed: order.status == 'done',
            ),
        ],
      ),
    );
  }

  Widget _header(BuildContext context, AppStrings s, OrderStatus order) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              order.topic,
              style: Theme.of(context).textTheme.titleLarge,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                StatusBadge(status: order.status),
                if (order.tierLabel != null) ...[
                  const SizedBox(width: 8),
                  _tierPill(context, order.tierLabel!),
                ],
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text(
                  s['orderId'],
                  style: Theme.of(
                    context,
                  ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    order.id,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  tooltip: s['copy'],
                  icon: const Icon(Icons.copy_rounded, size: 18),
                  onPressed: () => _copy(context, s, order.id),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _tierPill(BuildContext context, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.brand.surfaceSubtle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
      ),
    );
  }

  Widget _stateBanner(
    BuildContext context,
    WidgetRef ref,
    AppStrings s,
    OrderStatus order,
  ) {
    return switch (order.status) {
      'running' || 'paid' || 'queued' => _workingBanner(context, ref, s, order),
      'done' => _doneBanner(context, s, order),
      'failed' => _failedBanner(context, s, order),
      _ => _awaitingBanner(context, ref, s),
    };
  }

  Widget _workingBanner(
    BuildContext context,
    WidgetRef ref,
    AppStrings s,
    OrderStatus order,
  ) {
    final hours = ref
        .watch(configProvider)
        .asData
        ?.value
        .tiers[order.tier]
        ?.hours;
    final body = hours == null
        ? s['workingBodyNoEta']
        : s.fmt('workingBody', {'hours': hours});
    return _tintedCard(
      context,
      Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.35),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.auto_awesome,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  s['workingTitle'],
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            body,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
          ),
          const SizedBox(height: 12),
          const LinearProgressIndicator(
            minHeight: 6,
            borderRadius: BorderRadius.all(Radius.circular(999)),
          ),
          const SizedBox(height: 12),
          Text(
            s['reportEmail'],
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
          ),
        ],
      ),
    );
  }

  Widget _doneBanner(BuildContext context, AppStrings s, OrderStatus order) {
    final reportUrl = order.reportPath == null
        ? null
        : '${AppConfig.baseUrl}${order.reportPath}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _tintedCard(
          context,
          context.brand.success.withValues(alpha: 0.1),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.check_circle_rounded,
                    color: context.brand.success,
                    size: 28,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      s['doneTitle'],
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                s['doneBody'],
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
              ),
              const SizedBox(height: 16),
              if (order.reportPath != null) ...[
                FilledButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ReportScreen(
                        reportPath: order.reportPath!,
                        orderId: order.id,
                        title: order.topic,
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.description_rounded),
                  label: Text(s['report']),
                ),
                const SizedBox(height: 8),
                // Wrap, not a fixed two-column row: Korean labels do not fit
                // half a phone width and would break mid-word.
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => launchUrl(
                        Uri.parse(reportUrl!),
                        mode: LaunchMode.externalApplication,
                      ),
                      icon: const Icon(Icons.open_in_browser_rounded),
                      label: Text(s['openBrowser']),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _copy(context, s, reportUrl!),
                      icon: const Icon(Icons.link_rounded),
                      label: Text(s['copyLink']),
                    ),
                  ],
                ),
              ] else
                Text(
                  s['noReport'],
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          s['reportEmail'],
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
        ),
      ],
    );
  }

  Widget _failedBanner(BuildContext context, AppStrings s, OrderStatus order) {
    return _tintedCard(
      context,
      context.brand.danger.withValues(alpha: 0.1),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.error_outline_rounded, color: context.brand.danger),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  s['failedTitle'],
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            s['failedBody'],
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => launchUrl(
                    Uri(
                      scheme: 'mailto',
                      path: AppConfig.supportEmail,
                      queryParameters: {'subject': '${s['order']} ${order.id}'},
                    ),
                  ),
                  icon: const Icon(Icons.mail_outline_rounded),
                  label: Text(s['reportIssue']),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pushReplacement(
                    context,
                    MaterialPageRoute(
                      builder: (_) => OrderScreen(
                        initialTopic: order.topic,
                        initialTier: order.tier,
                      ),
                    ),
                  ),
                  child: Text(s['orderAgain']),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _awaitingBanner(BuildContext context, WidgetRef ref, AppStrings s) {
    return _tintedCard(
      context,
      context.brand.warning.withValues(alpha: 0.1),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            s['awaitingTitle'],
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 6),
          Text(
            s['awaitingBody'],
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              await ref.read(purchaseServiceProvider).restore();
              if (context.mounted) {
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text(s['restoreDone'])));
              }
            },
            icon: const Icon(Icons.restore_rounded),
            label: Text(s['restore']),
          ),
        ],
      ),
    );
  }

  Widget _tintedCard(BuildContext context, Color color, Widget child) {
    return Card(
      color: color,
      child: Padding(padding: const EdgeInsets.all(18), child: child),
    );
  }

  Future<void> _copy(BuildContext context, AppStrings s, String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(s['copied'])));
    }
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/config.dart';
import '../l10n/strings.dart';
import '../providers.dart';
import '../services/order_store.dart';
import 'report_screen.dart';

class OrderStatusScreen extends ConsumerWidget {
  const OrderStatusScreen({super.key, required this.orderId});
  final String orderId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.of(context);
    final state = ref.watch(orderStatusProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: Text(s['status'])),
      body: state.when(
        data: (o) {
          ref
              .read(orderStoreProvider)
              .addOrUpdate(
                LocalOrder(
                  id: o.id,
                  topic: o.topic,
                  tier: o.tier,
                  createdAt: o.createdAt,
                  lastStatus: o.status,
                ),
              );
          final visible = o.progress
              .where((p) => !p.message.toUpperCase().contains('USDC'))
              .toList();
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(o.topic, style: Theme.of(context).textTheme.titleLarge),
              Text('${s['orderId']}: ${o.id}'),
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: o.id));
                  if (context.mounted) {
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(s['copied'])));
                  }
                },
                icon: const Icon(Icons.copy),
                label: Text(s['copy']),
              ),
              Chip(label: Text(s[o.status])),
              const SizedBox(height: 12),
              ...visible.map(
                (p) => ListTile(
                  leading: const Icon(Icons.circle, size: 12),
                  title: Text(p.message),
                  subtitle: Text(p.at),
                ),
              ),
              if (o.status == 'done' && o.reportPath != null)
                FilledButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ReportScreen(
                        reportPath: o.reportPath!,
                        orderId: o.id,
                      ),
                    ),
                  ),
                  child: Text(s['report']),
                ),
              if (o.status == 'failed')
                OutlinedButton(
                  onPressed: () => launchUrl(
                    Uri(
                      scheme: 'mailto',
                      path: AppConfig.supportEmail,
                      queryParameters: {'subject': '${s['order']} ${o.id}'},
                    ),
                  ),
                  child: Text(s['reportIssue']),
                ),
              const SizedBox(height: 12),
              Text(s['reportEmail']),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
      ),
    );
  }
}

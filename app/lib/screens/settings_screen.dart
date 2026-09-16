import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/config.dart';
import '../l10n/strings.dart';
import '../widgets/content_width.dart';
import '../providers.dart';
import '../theme/app_theme.dart';
import '../widgets/brand_mark.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s['navSettings'])),
      body: ContentWidth(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _brandCard(context, s),
            _group(context, s['groupSupport'], [
              _tile(
                context,
                Icons.support_agent_outlined,
                s['support'],
                subtitle: AppConfig.supportEmail,
                onTap: () => launchUrl(
                  Uri(scheme: 'mailto', path: AppConfig.supportEmail),
                ),
              ),
              _tile(
                context,
                Icons.flag_outlined,
                s['reportIssue'],
                onTap: () => launchUrl(
                  Uri(
                    scheme: 'mailto',
                    path: AppConfig.supportEmail,
                    queryParameters: {'subject': s['reportIssue']},
                  ),
                ),
              ),
            ]),
            _group(context, s['groupPayments'], [
              _tile(
                context,
                Icons.restore_rounded,
                s['restore'],
                subtitle: s['restoreHint'],
                onTap: () async {
                  await ref.read(purchaseServiceProvider).restore();
                  if (context.mounted) {
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(s['restoreDone'])));
                  }
                },
              ),
            ]),
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                s[Platform.isIOS ? 'paymentStoreIos' : 'paymentStoreAndroid'],
                style: Theme.of(
                  context,
                ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
              ),
            ),
            _group(context, s['groupLegal'], [
              _tile(
                context,
                Icons.privacy_tip_outlined,
                s['privacy'],
                onTap: () => _open(context, '/privacy.html'),
              ),
              _tile(
                context,
                Icons.description_outlined,
                s['terms'],
                onTap: () => _open(context, '/terms.html'),
              ),
            ]),
            const SizedBox(height: 28),
            Text(
              s['footerBrand'],
              style: Theme.of(
                context,
              ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _brandCard(BuildContext context, AppStrings s) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            const BrandMark(size: 56, wordmark: false),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'DeepDesk',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    s['appDescription'],
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: context.brand.muted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  FutureBuilder<PackageInfo>(
                    future: PackageInfo.fromPlatform(),
                    builder: (context, snapshot) {
                      final data = snapshot.data;
                      return Text(
                        data == null
                            ? ''
                            : '${data.version} (${data.buildNumber})',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: context.brand.muted,
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _group(BuildContext context, String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(0, 24, 0, 8),
          child: Text(
            title.toUpperCase(),
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
          ),
        ),
        Card(child: Column(children: _separated(children))),
      ],
    );
  }

  List<Widget> _separated(List<Widget> children) {
    final result = <Widget>[];
    for (var index = 0; index < children.length; index++) {
      result.add(children[index]);
      if (index < children.length - 1) {
        result.add(const Divider(indent: 64));
      }
    }
    return result;
  }

  Widget _tile(
    BuildContext context,
    IconData icon,
    String title, {
    String? subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: context.brand.surfaceSubtle,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: Theme.of(context).colorScheme.primary),
      ),
      title: Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontSize: 15),
      ),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontSize: 13,
                color: context.brand.muted,
              ),
            ),
      trailing: Icon(Icons.chevron_right_rounded, color: context.brand.muted),
      onTap: onTap,
    );
  }

  Future<void> _open(BuildContext context, String path) {
    return launchUrl(
      Uri.parse('${AppConfig.baseUrl}$path'),
      mode: LaunchMode.externalApplication,
    );
  }
}

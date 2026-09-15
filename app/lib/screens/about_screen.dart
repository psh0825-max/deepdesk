import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/config.dart';
import '../l10n/strings.dart';
import '../providers.dart';

class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s['about'])),
      body: FutureBuilder<PackageInfo>(
        future: PackageInfo.fromPlatform(),
        builder: (context, snap) => ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('DeepDesk', style: TextStyle(fontSize: 24)),
            Text(s['appDescription']),
            Text(
              snap.hasData
                  ? '${snap.data!.version}+${snap.data!.buildNumber}'
                  : '',
            ),
            const SizedBox(height: 16),
            ListTile(
              title: Text(s['privacy']),
              onTap: () => launchUrl(
                Uri.parse('${AppConfig.baseUrl}/privacy.html'),
                mode: LaunchMode.externalApplication,
              ),
            ),
            ListTile(
              title: Text(s['terms']),
              onTap: () => launchUrl(
                Uri.parse('${AppConfig.baseUrl}/terms.html'),
                mode: LaunchMode.externalApplication,
              ),
            ),
            ListTile(
              title: Text(s['support']),
              onTap: () => launchUrl(
                Uri(scheme: 'mailto', path: AppConfig.supportEmail),
              ),
            ),
            ListTile(
              title: Text(s['restore']),
              onTap: () async {
                await ref.read(purchaseServiceProvider).restore();
                if (context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text(s['restoreDone'])));
                }
              },
            ),
            const SizedBox(height: 8),
            Text(s[Platform.isIOS ? 'paymentStoreIos' : 'paymentStoreAndroid']),
          ],
        ),
      ),
    );
  }
}

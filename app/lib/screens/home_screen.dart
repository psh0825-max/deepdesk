import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../l10n/strings.dart';
import '../widgets/content_width.dart';
import '../providers.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/brand_mark.dart';
import '../widgets/error_view.dart';
import '../widgets/section_header.dart';
import '../widgets/tier_card.dart';
import 'order_screen.dart';
import 'report_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.of(context);
    return Scaffold(
      body: ContentWidth(
        child: CustomScrollView(
          slivers: [
            SliverAppBar(pinned: true, title: const BrandMark(size: 26)),
            SliverToBoxAdapter(child: _hero(context, s)),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              sliver: SliverToBoxAdapter(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ReportScreen(
                        reportPath: '/reports/sample.html',
                        title: s['sampleReport'],
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.visibility_outlined),
                  label: Text(s['viewSample']),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SectionHeader(
                title: s['useCasesTitle'],
                subtitle: s['useCasesSub'],
              ),
            ),
            SliverToBoxAdapter(child: _useCases(context, s)),
            SliverToBoxAdapter(child: SectionHeader(title: s['howTitle'])),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverToBoxAdapter(child: _howItWorks(context, s)),
            ),
            SliverToBoxAdapter(
              child: SectionHeader(
                title: s['pricingTitle'],
                subtitle: s['pricingSub'],
              ),
            ),
            SliverToBoxAdapter(child: _plans(context, ref, s)),
            SliverToBoxAdapter(child: SectionHeader(title: s['faqTitle'])),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverToBoxAdapter(child: _faq(context, s)),
            ),
            SliverToBoxAdapter(child: _footer(context, s)),
          ],
        ),
      ),
    );
  }

  void _openOrder(BuildContext context, {String? tier, String? topic}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            OrderScreen(initialTier: tier ?? 'standard', initialTopic: topic),
      ),
    );
  }

  Widget _hero(BuildContext context, AppStrings s) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: LinearGradient(
            colors: [context.brand.navy, context.brand.accent],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              s['heroTitle'],
              style: Theme.of(
                context,
              ).textTheme.headlineMedium?.copyWith(color: scheme.onPrimary),
            ),
            const SizedBox(height: 10),
            Text(
              s['heroSub'],
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: scheme.onPrimary.withValues(alpha: 0.85),
              ),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _trustPill(context, Icons.timer_outlined, s['trustFast']),
                _trustPill(context, Icons.link_rounded, s['trustSources']),
                _trustPill(
                  context,
                  Icons.mark_email_read_outlined,
                  s['trustEmail'],
                ),
              ],
            ),
            const SizedBox(height: 22),
            FilledButton.icon(
              onPressed: () => _openOrder(context),
              style: FilledButton.styleFrom(
                backgroundColor: scheme.onPrimary,
                foregroundColor: context.brand.navy,
              ),
              iconAlignment: IconAlignment.end,
              icon: const Icon(Icons.arrow_forward_rounded),
              label: Text(s['ctaOrder']),
            ),
          ],
        ),
      ),
    );
  }

  Widget _trustPill(BuildContext context, IconData icon, String label) {
    final onPrimary = Theme.of(context).colorScheme.onPrimary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: onPrimary.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: onPrimary),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: onPrimary),
          ),
        ],
      ),
    );
  }

  Widget _useCases(BuildContext context, AppStrings s) {
    const entries = [
      (Icons.storefront_outlined, 'useCaseMarket', 'exMarket'),
      (Icons.compare_arrows_rounded, 'useCaseCompetitor', 'exCompetitor'),
      (Icons.lightbulb_outline, 'useCaseStartup', 'exStartup'),
      (Icons.shopping_bag_outlined, 'useCasePurchase', 'exPurchase'),
      (Icons.trending_up_rounded, 'useCaseInvest', 'exInvest'),
      (Icons.school_outlined, 'useCaseAcademic', 'exAcademic'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: entries
            .map(
              (entry) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ActionChip(
                  avatar: Icon(entry.$1, size: 18),
                  label: Text(s[entry.$2]),
                  onPressed: () => _openOrder(context, topic: s[entry.$3]),
                ),
              ),
            )
            .toList(),
      ),
    );
  }

  Widget _howItWorks(BuildContext context, AppStrings s) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _step(context, '1', s['how1t'], s['how1p']),
            const Divider(),
            _step(context, '2', s['how2t'], s['how2p']),
            const Divider(),
            _step(context, '3', s['how3t'], s['how3p']),
          ],
        ),
      ),
    );
  }

  Widget _step(BuildContext context, String number, String title, String body) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.primary,
              shape: BoxShape.circle,
            ),
            child: Text(
              number,
              style: Theme.of(
                context,
              ).textTheme.labelLarge?.copyWith(color: scheme.onPrimary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 3),
                Text(
                  body,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _plans(BuildContext context, WidgetRef ref, AppStrings s) {
    final config = ref.watch(configProvider);
    return config.when(
      loading: () => const SizedBox(
        height: 180,
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, _) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: ErrorView(
          title: s['offlineTitle'],
          message: s['offlineMessage'],
          onRetry: () => ref.invalidate(configProvider),
        ),
      ),
      data: (value) =>
          _tierCards(context, ref.watch(productsProvider), value, s),
    );
  }

  Widget _tierCards(
    BuildContext context,
    AsyncValue<List<ProductDetails>> products,
    ServerConfig config,
    AppStrings s,
  ) {
    final loadedProducts = products.asData?.value ?? const <ProductDetails>[];
    final priceById = {
      for (final product in loadedProducts) product.id: product.price,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: ['light', 'standard', 'deep'].map((id) {
          final tier = config.tiers[id];
          if (tier == null) {
            return const SizedBox.shrink();
          }
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TierCard(
              tier: tier,
              price: priceById[config.productIds[id]],
              popular: id == 'standard',
              features: _featuresFor(id, s),
              onTap: () => _openOrder(context, tier: id),
            ),
          );
        }).toList(),
      ),
    );
  }

  List<String> _featuresFor(String id, AppStrings s) {
    return [s['feat_${id}_1'], s['feat_${id}_2'], s['feat_${id}_3']];
  }

  Widget _faq(BuildContext context, AppStrings s) {
    return Card(
      child: Column(
        children: List.generate(4, (index) {
          final number = index + 1;
          return ExpansionTile(
            shape: const Border(),
            collapsedShape: const Border(),
            tilePadding: const EdgeInsets.symmetric(horizontal: 16),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            title: Text(
              s['faq${number}q'],
              style: Theme.of(context).textTheme.titleMedium,
            ),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  s['faq${number}a'],
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
                ),
              ),
            ],
          );
        }),
      ),
    );
  }

  Widget _footer(BuildContext context, AppStrings s) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 32),
      child: Column(
        children: [
          Text(
            s[Platform.isIOS ? 'paymentStoreIos' : 'paymentStoreAndroid'],
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            s['footerBrand'],
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
          ),
        ],
      ),
    );
  }
}

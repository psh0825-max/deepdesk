import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';

class TierCard extends StatelessWidget {
  const TierCard({
    super.key,
    required this.tier,
    required this.features,
    this.price,
    this.selected = false,
    this.popular = false,
    this.onTap,
  });

  final TierInfo tier;
  final String? price;
  final bool selected;
  final bool popular;
  final List<String> features;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final s = AppStrings.of(context);
    return Semantics(
      button: true,
      selected: selected,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          color: selected
              ? scheme.primaryContainer.withValues(alpha: 0.35)
              : scheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? scheme.primary : context.brand.line,
            width: selected ? 1.6 : 1,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(tier.label, style: text.titleMedium),
                    if (popular) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: scheme.primary,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          s['popular'],
                          style: text.labelSmall?.copyWith(
                            color: scheme.onPrimary,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        price ?? s['loadingProducts'],
                        textAlign: TextAlign.end,
                        style: price == null
                            ? text.bodyMedium?.copyWith(
                                color: context.brand.muted,
                              )
                            : text.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  s.fmt('tierMeta', {'pages': tier.pages, 'hours': tier.hours}),
                  style: text.bodyMedium?.copyWith(color: context.brand.muted),
                ),
                const SizedBox(height: 14),
                ...features.map(
                  (feature) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(
                          Icons.check_rounded,
                          size: 18,
                          color: scheme.primary,
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(feature, style: text.bodyMedium)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

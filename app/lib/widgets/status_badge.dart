import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status});

  final String status;

  Color _color(BuildContext context) {
    final brand = context.brand;
    return switch (status) {
      'done' => brand.success,
      'running' || 'paid' || 'queued' => brand.accent,
      'failed' => brand.danger,
      'awaiting_payment' || 'pending' => brand.warning,
      _ => brand.muted,
    };
  }

  @override
  Widget build(BuildContext context) {
    final color = _color(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            AppStrings.of(context)[status],
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}

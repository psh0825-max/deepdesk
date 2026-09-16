import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';

class ErrorView extends StatelessWidget {
  const ErrorView({
    super.key,
    required this.title,
    required this.message,
    required this.onRetry,
  });

  final String title;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: context.brand.surfaceSubtle,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.cloud_off_rounded,
                size: 56,
                color: context.brand.muted,
              ),
            ),
            const SizedBox(height: 20),
            Text(title, style: text.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              message,
              style: text.bodyMedium?.copyWith(color: context.brand.muted),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            OutlinedButton(
              onPressed: onRetry,
              child: Text(AppStrings.of(context)['retry']),
            ),
          ],
        ),
      ),
    );
  }
}

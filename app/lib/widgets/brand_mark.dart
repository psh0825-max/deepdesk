import 'package:flutter/material.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 28, this.wordmark = true});

  final double size;
  final bool wordmark;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(size * 0.24),
          child: Image.asset('assets/icon.png', width: size, height: size),
        ),
        if (wordmark) ...[
          SizedBox(width: size * 0.3),
          Text(
            'DeepDesk',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontSize: size * 0.72,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
        ],
      ],
    );
  }
}

import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class TimelineEntry {
  const TimelineEntry(this.message, this.time);

  final String message;
  final String time;
}

class ProgressTimeline extends StatelessWidget {
  const ProgressTimeline({
    super.key,
    required this.entries,
    required this.completed,
  });

  final List<TimelineEntry> entries;
  final bool completed;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(entries.length, (index) {
        final last = index == entries.length - 1;
        final checked = !last || completed;
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 28,
                child: Column(
                  children: [
                    _Node(checked: checked),
                    if (!last)
                      Expanded(
                        child: Container(width: 2, color: context.brand.line),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entries[index].message,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: last ? FontWeight.w500 : null,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        entries[index].time,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: context.brand.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}

class _Node extends StatelessWidget {
  const _Node({required this.checked});

  final bool checked;

  @override
  Widget build(BuildContext context) {
    if (!checked) {
      return const _PulseDot();
    }
    return Container(
      width: 14,
      height: 14,
      decoration: BoxDecoration(
        color: context.brand.accent,
        shape: BoxShape.circle,
      ),
      child: Icon(
        Icons.check,
        size: 10,
        color: Theme.of(context).colorScheme.onPrimary,
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  const _PulseDot();

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accent = context.brand.accent;
    return Container(
      width: 14,
      height: 14,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        border: Border.all(color: accent, width: 1.5),
        shape: BoxShape.circle,
      ),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Transform.scale(
            scale: 0.6 + (_controller.value * 0.4),
            child: child,
          );
        },
        child: DecoratedBox(
          decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
        ),
      ),
    );
  }
}

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/strings.dart';
import '../providers.dart';
import 'history_screen.dart';
import 'home_screen.dart';
import 'settings_screen.dart';

class RootShell extends ConsumerStatefulWidget {
  const RootShell({super.key});

  @override
  ConsumerState<RootShell> createState() => _RootShellState();
}

class _RootShellState extends ConsumerState<RootShell> {
  static bool _recoveredUnfinishedPurchases = false;
  var _index = 0;
  // Bumped whenever the reports tab is opened so the list re-reads local
  // storage; a const child inside IndexedStack would otherwise stay stale
  // after an order placed from the home tab.
  var _reportsEpoch = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_recoveredUnfinishedPurchases) {
        return;
      }
      _recoveredUnfinishedPurchases = true;
      unawaited(ref.read(purchaseServiceProvider).recoverUnfinished());
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          const HomeScreen(),
          HistoryScreen(key: ValueKey(_reportsEpoch)),
          const SettingsScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() {
          if (value == 1) {
            _reportsEpoch++;
          }
          _index = value;
        }),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home_rounded),
            label: s['navHome'],
          ),
          NavigationDestination(
            icon: const Icon(Icons.description_outlined),
            selectedIcon: const Icon(Icons.description_rounded),
            label: s['navReports'],
          ),
          NavigationDestination(
            icon: const Icon(Icons.settings_outlined),
            selectedIcon: const Icon(Icons.settings_rounded),
            label: s['navSettings'],
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase_storekit/in_app_purchase_storekit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'providers.dart';
import 'screens/root_shell.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 서버(/api/iap/confirm)는 verifyReceipt(StoreKit 1 영수증)만 검증한다.
  // StoreKit 2 기본값이면 앱이 JWS를 보내 21002로 거부된다 — Songbit에서 실제로 겪은 사고.
  // InAppPurchase.instance를 처음 만지기 전에 호출해야 적용된다.
  if (defaultTargetPlatform == TargetPlatform.iOS) {
    // ignore: deprecated_member_use
    await InAppPurchaseStoreKitPlatform.enableStoreKit1();
  }
  final prefs = await SharedPreferences.getInstance();
  runApp(
    ProviderScope(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      child: const DeepDeskApp(),
    ),
  );
}

class DeepDeskApp extends StatelessWidget {
  const DeepDeskApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DeepDesk',
      debugShowCheckedModeBanner: false,
      supportedLocales: const [Locale('ko'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: const RootShell(),
    );
  }
}

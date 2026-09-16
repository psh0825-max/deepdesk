import 'package:flutter/material.dart';

@immutable
class Brand extends ThemeExtension<Brand> {
  const Brand({
    required this.navy,
    required this.accent,
    required this.success,
    required this.warning,
    required this.danger,
    required this.surfaceSubtle,
    required this.line,
    required this.muted,
  });

  final Color navy;
  final Color accent;
  final Color success;
  final Color warning;
  final Color danger;
  final Color surfaceSubtle;
  final Color line;
  final Color muted;

  static const light = Brand(
    navy: Color(0xFF123B73),
    accent: Color(0xFF2563EB),
    success: Color(0xFF16A34A),
    warning: Color(0xFFD97706),
    danger: Color(0xFFDC2626),
    surfaceSubtle: Color(0xFFF3F6FB),
    line: Color(0xFFE2E8F0),
    muted: Color(0xFF64748B),
  );

  static const dark = Brand(
    navy: Color(0xFF9DB7E8),
    accent: Color(0xFF7FA6FF),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFFBBF24),
    danger: Color(0xFFF87171),
    surfaceSubtle: Color(0xFF161B26),
    line: Color(0xFF2A3140),
    muted: Color(0xFF94A3B8),
  );

  @override
  Brand copyWith({
    Color? navy,
    Color? accent,
    Color? success,
    Color? warning,
    Color? danger,
    Color? surfaceSubtle,
    Color? line,
    Color? muted,
  }) {
    return Brand(
      navy: navy ?? this.navy,
      accent: accent ?? this.accent,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      surfaceSubtle: surfaceSubtle ?? this.surfaceSubtle,
      line: line ?? this.line,
      muted: muted ?? this.muted,
    );
  }

  @override
  Brand lerp(covariant Brand? other, double t) {
    if (other == null) {
      return this;
    }
    return Brand(
      navy: Color.lerp(navy, other.navy, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      surfaceSubtle: Color.lerp(surfaceSubtle, other.surfaceSubtle, t)!,
      line: Color.lerp(line, other.line, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
    );
  }
}

extension BrandX on BuildContext {
  Brand get brand => Theme.of(this).extension<Brand>()!;
}

class AppTheme {
  /// [fontFamily] is only set by the store-screenshot harness (bundled Noto);
  /// the app itself uses the platform font.
  static ThemeData light({String? fontFamily}) =>
      _base(Brightness.light, fontFamily);

  static ThemeData dark({String? fontFamily}) =>
      _base(Brightness.dark, fontFamily);

  static ThemeData _base(Brightness brightness, String? fontFamily) {
    final isLight = brightness == Brightness.light;
    final brand = isLight ? Brand.light : Brand.dark;
    final scaffold = isLight
        ? const Color(0xFFF6F8FB)
        : const Color(0xFF0F131A);
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF123B73),
      brightness: brightness,
    ).copyWith(primary: brand.navy);
    final text = ThemeData(
      brightness: brightness,
    ).textTheme.apply(fontFamily: fontFamily);
    // Component themes derive from this so the font family propagates.
    final textTheme = text.copyWith(
      headlineMedium: text.headlineMedium?.copyWith(
        fontSize: 28,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
        height: 1.2,
      ),
      titleLarge: text.titleLarge?.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
      titleMedium: text.titleMedium?.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
      bodyLarge: text.bodyLarge?.copyWith(fontSize: 16, height: 1.5),
      bodyMedium: text.bodyMedium?.copyWith(fontSize: 14.5, height: 1.5),
      labelLarge: text.labelLarge?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
      labelSmall: text.labelSmall?.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
      ),
    );
    final inputRadius = BorderRadius.circular(14);
    final inputBorder = OutlineInputBorder(
      borderRadius: inputRadius,
      borderSide: BorderSide(color: brand.line),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffold,
      visualDensity: VisualDensity.standard,
      splashFactory: InkSparkle.splashFactory,
      fontFamily: fontFamily,
      textTheme: textTheme,
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface,
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: brand.line),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: inputBorder,
        enabledBorder: inputBorder,
        focusedBorder: OutlineInputBorder(
          borderRadius: inputRadius,
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: inputRadius,
          borderSide: BorderSide(color: brand.danger),
        ),
        labelStyle: textTheme.bodyLarge?.copyWith(color: brand.muted),
        hintStyle: textTheme.bodyLarge?.copyWith(color: brand.muted),
        helperMaxLines: 2,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: textTheme.labelLarge?.copyWith(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(50),
          side: BorderSide(color: brand.line, width: 1.2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: textTheme.labelLarge?.copyWith(fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(textStyle: textTheme.labelLarge),
      ),
      chipTheme: ChipThemeData(
        shape: const StadiumBorder(),
        side: BorderSide(color: brand.line),
        backgroundColor: scheme.surface,
        labelStyle: textTheme.labelLarge?.copyWith(fontSize: 13),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        showCheckmark: false,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            return states.contains(WidgetState.selected)
                ? scheme.primaryContainer
                : null;
          }),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        indicatorColor: scheme.primaryContainer,
        labelTextStyle: WidgetStatePropertyAll(
          textTheme.labelSmall?.copyWith(letterSpacing: 0),
        ),
        backgroundColor: scheme.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: scaffold,
        titleTextStyle: textTheme.titleLarge?.copyWith(color: scheme.onSurface),
      ),
      dividerTheme: DividerThemeData(color: brand.line, thickness: 1, space: 1),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      extensions: [brand],
    );
  }
}

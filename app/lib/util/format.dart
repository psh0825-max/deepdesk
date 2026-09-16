import '../l10n/strings.dart';

String formatClock(String iso) {
  final date = DateTime.tryParse(iso)?.toLocal();
  if (date == null) {
    return iso;
  }
  return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
}

String formatRelative(String iso, AppStrings s) {
  final date = DateTime.tryParse(iso)?.toLocal();
  if (date == null) {
    return iso;
  }
  final difference = DateTime.now().difference(date);
  if (difference.inMinutes < 1) {
    return s['justNow'];
  }
  if (difference.inHours < 1) {
    return s.fmt('minutesAgo', {'n': difference.inMinutes});
  }
  if (difference.inDays < 1) {
    return s.fmt('hoursAgo', {'n': difference.inHours});
  }
  if (difference.inDays < 7) {
    return s.fmt('daysAgo', {'n': difference.inDays});
  }
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}

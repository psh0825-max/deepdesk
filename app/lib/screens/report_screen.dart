import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../core/config.dart';
import '../l10n/strings.dart';
import '../widgets/error_view.dart';

({String view, String share}) reportUrls(String baseUrl, String reportPath) {
  final share = '$baseUrl$reportPath';
  final separator = reportPath.contains('?') ? '&' : '?';
  return (view: '$share${separator}app=1', share: share);
}

class ReportScreen extends StatefulWidget {
  const ReportScreen({
    super.key,
    required this.reportPath,
    this.orderId,
    this.title,
  });

  final String reportPath;
  final String? orderId;
  final String? title;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  late final WebViewController _controller;
  var _loading = true;
  var _error = false;

  String get _viewUrl => reportUrls(AppConfig.baseUrl, widget.reportPath).view;
  String get _shareUrl =>
      reportUrls(AppConfig.baseUrl, widget.reportPath).share;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() => _loading = true),
          onPageFinished: (_) => setState(() => _loading = false),
          onWebResourceError: (error) {
            if (error.isForMainFrame ?? true) {
              setState(() {
                _error = true;
                _loading = false;
              });
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(_viewUrl));
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.title ?? s['report'],
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: _loading
              ? const LinearProgressIndicator(minHeight: 3)
              : const SizedBox(height: 3),
        ),
        actions: [
          IconButton(
            tooltip: s['openBrowser'],
            icon: const Icon(Icons.open_in_browser_rounded),
            onPressed: () => launchUrl(
              Uri.parse(_shareUrl),
              mode: LaunchMode.externalApplication,
            ),
          ),
          IconButton(
            tooltip: s['copyLink'],
            icon: const Icon(Icons.link_rounded),
            onPressed: () => _copy(context, s),
          ),
          if (widget.orderId != null)
            IconButton(
              tooltip: s['reportIssue'],
              icon: const Icon(Icons.flag_outlined),
              onPressed: () => launchUrl(
                Uri(
                  scheme: 'mailto',
                  path: AppConfig.supportEmail,
                  queryParameters: {
                    'subject': '${s['order']} ${widget.orderId}',
                  },
                ),
              ),
            ),
        ],
      ),
      body: _error
          ? ErrorView(
              title: s['offlineTitle'],
              message: s['offlineMessage'],
              onRetry: _retry,
            )
          : WebViewWidget(controller: _controller),
    );
  }

  Future<void> _copy(BuildContext context, AppStrings s) async {
    await Clipboard.setData(ClipboardData(text: _shareUrl));
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(s['copied'])));
    }
  }

  void _retry() {
    setState(() {
      _error = false;
      _loading = true;
    });
    _controller.loadRequest(Uri.parse(_viewUrl));
  }
}

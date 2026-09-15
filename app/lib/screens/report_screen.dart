import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../core/config.dart';
import '../l10n/strings.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({
    super.key,
    required this.reportPath,
    required this.orderId,
  });
  final String reportPath, orderId;
  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  String get _url => '${AppConfig.baseUrl}${widget.reportPath}';
  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() => _loading = true),
          onPageFinished: (_) => setState(() => _loading = false),
        ),
      )
      ..loadRequest(Uri.parse(_url));
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(s['report']),
        actions: [
          IconButton(
            tooltip: s['openBrowser'],
            icon: const Icon(Icons.open_in_browser),
            onPressed: () => launchUrl(
              Uri.parse(_url),
              mode: LaunchMode.externalApplication,
            ),
          ),
          IconButton(
            tooltip: s['reportIssue'],
            icon: const Icon(Icons.flag_outlined),
            onPressed: () => launchUrl(
              Uri(
                scheme: 'mailto',
                path: AppConfig.supportEmail,
                queryParameters: {'subject': '${s['order']} ${widget.orderId}'},
              ),
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading) const Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }
}

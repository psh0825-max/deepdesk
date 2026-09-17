import 'package:deepdesk_app/screens/report_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('report URLs use the app variant only for the in-app view', () {
    const screen = ReportScreen(
      reportPath: '/reports/x.html',
      orderId: 'DD-1',
      title: 't',
    );
    final urls = reportUrls('https://deepdesk.example', '/reports/x.html');

    expect(screen.reportPath, '/reports/x.html');
    expect(urls.view, 'https://deepdesk.example/reports/x.html?app=1');
    expect(urls.share, 'https://deepdesk.example/reports/x.html');
  });

  test('report view URL appends its flag to an existing query', () {
    final urls = reportUrls('https://deepdesk.example', '/reports/x.html?x=1');

    expect(urls.view, 'https://deepdesk.example/reports/x.html?x=1&app=1');
    expect(urls.share, 'https://deepdesk.example/reports/x.html?x=1');
  });
}

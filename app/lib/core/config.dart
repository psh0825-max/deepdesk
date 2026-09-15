class AppConfig {
  static const baseUrl = String.fromEnvironment(
    'DEEPDESK_BASE_URL',
    defaultValue: 'https://deepdesk-o5kintt6za-du.a.run.app',
  );
  static const supportEmail = 'support@lightonpluslab.com';
  static const productFallbacks = <String, String>{
    'light': 'deepdesk_light',
    'standard': 'deepdesk_standard',
    'deep': 'deepdesk_deep',
  };
}

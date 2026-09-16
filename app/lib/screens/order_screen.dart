import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../l10n/strings.dart';
import '../widgets/content_width.dart';
import '../providers.dart';
import '../services/api_client.dart';
import '../services/order_store.dart';
import '../theme/app_theme.dart';
import '../widgets/info_row.dart';
import '../widgets/section_header.dart';
import 'order_status_screen.dart';

class OrderScreen extends ConsumerStatefulWidget {
  const OrderScreen({
    super.key,
    this.initialTier = 'standard',
    this.initialTopic,
  });

  final String initialTier;
  final String? initialTopic;

  @override
  ConsumerState<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends ConsumerState<OrderScreen> {
  final _topic = TextEditingController();
  final _brief = TextEditingController();
  final _email = TextEditingController();
  String _tier = 'standard';
  String _language = 'en';
  StreamSubscription? _sub;
  var _waiting = false;

  @override
  void initState() {
    super.initState();
    _tier = widget.initialTier;
    _topic.text = widget.initialTopic ?? '';
    _email.text = ref.read(sharedPreferencesProvider).getString('email') ?? '';
    _language = Platform.localeName.toLowerCase().startsWith('ko')
        ? 'ko'
        : 'en';
    _sub = ref.read(purchaseServiceProvider).outcomes.listen(_outcome);
  }

  void _outcome(dynamic outcome) {
    if (!mounted) {
      return;
    }
    if (outcome.type == 'pending') {
      setState(() => _waiting = true);
      return;
    }
    if (outcome.type == 'confirmed' || outcome.type == 'reusedToken') {
      setState(() => _waiting = false);
      HapticFeedback.mediumImpact();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => OrderStatusScreen(orderId: outcome.orderId),
        ),
      );
      return;
    }
    setState(() => _waiting = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          outcome.message == null
              ? AppStrings.of(context)[outcome.type]
              : AppStrings.of(context)[outcome.message],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _sub?.cancel();
    _topic.dispose();
    _brief.dispose();
    _email.dispose();
    super.dispose();
  }

  bool get _valid {
    return _topic.text.trim().length >= 5 &&
        RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim());
  }

  Future<void> _submit(
    ServerConfig config,
    List<ProductDetails> products,
  ) async {
    final s = AppStrings.of(context);
    final product = products
        .where((item) => item.id == config.productIds[_tier])
        .firstOrNull;
    if (product == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(s['productsUnavailable'])));
      return;
    }
    try {
      final created = await ref
          .read(apiClientProvider)
          .createOrder(
            topic: _topic.text.trim(),
            brief: _brief.text.trim(),
            email: _email.text.trim(),
            tier: _tier,
            language: _language,
            payMethod: Platform.isIOS ? 'iap_ios' : 'iap_android',
          );
      await ref
          .read(sharedPreferencesProvider)
          .setString('email', _email.text.trim());
      await ref
          .read(orderStoreProvider)
          .addOrUpdate(
            LocalOrder(
              id: created.id,
              topic: _topic.text.trim(),
              tier: _tier,
              createdAt: DateTime.now().toIso8601String(),
              lastStatus: created.status,
            ),
          );
      setState(() => _waiting = true);
      await ref.read(purchaseServiceProvider).buy(product, created.id);
    } catch (error) {
      if (mounted) {
        setState(() => _waiting = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final config = ref.watch(configProvider);
    final products = ref.watch(productsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(s['orderTitle'])),
      body: ContentWidth(
        child: config.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => Center(child: Text(s['productsUnavailable'])),
          data: (value) => _checkout(
            context,
            s,
            value,
            products.asData?.value ?? const <ProductDetails>[],
          ),
        ),
      ),
    );
  }

  Widget _checkout(
    BuildContext context,
    AppStrings s,
    ServerConfig config,
    List<ProductDetails> products,
  ) {
    final available = {for (final product in products) product.id: product};
    final currentTier = config.tiers[_tier] ?? config.tiers.values.first;
    final currentProduct = available[config.productIds[_tier]];
    return Stack(
      children: [
        Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                children: [
                  Text(
                    s['topicLabel'],
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _topic,
                    maxLength: 300,
                    minLines: 2,
                    maxLines: 4,
                    textInputAction: TextInputAction.newline,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: s['topicHint'],
                      helperText: s['topicHelper'],
                      counterText: '',
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      '${_topic.text.characters.length}/300',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: context.brand.muted,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    s['examplesLabel'],
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: context.brand.muted,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: ['exMarket', 'exStartup', 'exPurchase']
                        .map(
                          (key) => ActionChip(
                            label: Text(_truncate(s[key])),
                            onPressed: () =>
                                setState(() => _topic.text = s[key]),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    s['brief'],
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _brief,
                    maxLength: 2000,
                    minLines: 3,
                    maxLines: 6,
                    decoration: InputDecoration(
                      hintText: s['briefHint'],
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    s['email'],
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: 'name@example.com',
                      helperText: s['emailReason'],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    s['language'],
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: SegmentedButton<String>(
                      segments: [
                        ButtonSegment(value: 'ko', label: Text(s['korean'])),
                        ButtonSegment(value: 'en', label: Text(s['english'])),
                      ],
                      selected: {_language},
                      onSelectionChanged: (selection) {
                        setState(() => _language = selection.first);
                      },
                    ),
                  ),
                  SectionHeader(title: s['chooseTier']),
                  ...['light', 'standard', 'deep'].map(
                    (id) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _tierTile(
                        context,
                        s,
                        id,
                        config.tiers[id],
                        available[config.productIds[id]],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  _summary(context, s, currentTier, currentProduct),
                  const SizedBox(height: 8),
                  Text(
                    '${s[Platform.isIOS ? 'paymentStoreIos' : 'paymentStoreAndroid']} · ${s['deliveryNote']}',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: context.brand.muted,
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
            _bottomBar(context, s, config, products, currentProduct),
          ],
        ),
        if (_waiting)
          ModalBarrier(
            color: Theme.of(context).colorScheme.scrim.withValues(alpha: 0.54),
            dismissible: false,
          ),
        if (_waiting) _waitingCard(context, s),
      ],
    );
  }

  String _truncate(String text) {
    return text.characters.length > 22
        ? '${text.characters.take(22).toString()}…'
        : text;
  }

  Widget _tierTile(
    BuildContext context,
    AppStrings s,
    String id,
    TierInfo? tier,
    ProductDetails? product,
  ) {
    final selected = _tier == id;
    final enabled = product != null && tier != null;
    final scheme = Theme.of(context).colorScheme;
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: InkWell(
        onTap: enabled ? () => setState(() => _tier = id) : null,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? scheme.primary : context.brand.line,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              _selectionIndicator(context, selected),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            tier?.label ?? id,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            product?.price ?? s['loadingProducts'],
                            textAlign: TextAlign.end,
                            style: product == null
                                ? Theme.of(context).textTheme.bodyMedium
                                      ?.copyWith(color: context.brand.muted)
                                : Theme.of(context).textTheme.titleMedium
                                      ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      tier == null
                          ? ''
                          : s.fmt('tierMeta', {
                              'pages': tier.pages,
                              'hours': tier.hours,
                            }),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.brand.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _selectionIndicator(BuildContext context, bool selected) {
    final primary = Theme.of(context).colorScheme.primary;
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: selected ? primary : null,
        border: Border.all(
          color: selected ? primary : context.brand.line,
          width: 2,
        ),
        shape: BoxShape.circle,
      ),
      child: selected
          ? Icon(
              Icons.check,
              size: 14,
              color: Theme.of(context).colorScheme.onPrimary,
            )
          : null,
    );
  }

  Widget _summary(
    BuildContext context,
    AppStrings s,
    TierInfo tier,
    ProductDetails? product,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              s['summaryTitle'],
              style: Theme.of(
                context,
              ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
            ),
            const SizedBox(height: 6),
            InfoRow(label: s['summaryTier'], value: tier.label),
            InfoRow(label: s['summaryScope'], value: tier.pages),
            InfoRow(
              label: s['summaryEta'],
              value: s.fmt('etaValue', {'hours': tier.hours}),
            ),
            InfoRow(
              label: s['summaryLanguage'],
              value: _language == 'ko' ? s['korean'] : s['english'],
            ),
            const Divider(),
            InfoRow(
              label: s['summaryTotal'],
              value: product?.price ?? s['loadingProducts'],
              emphasize: true,
            ),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar(
    BuildContext context,
    AppStrings s,
    ServerConfig config,
    List<ProductDetails> products,
    ProductDetails? product,
  ) {
    final reason = !_valid
        ? (_topic.text.trim().length < 5
              ? s['invalidTopic']
              : s['invalidEmail'])
        : product == null
        ? s['loadingProducts']
        : null;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          border: Border(top: BorderSide(color: context.brand.line)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (reason != null)
              Text(
                reason,
                style: Theme.of(
                  context,
                ).textTheme.labelSmall?.copyWith(color: context.brand.muted),
              ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: reason == null
                  ? () => _submit(config, products)
                  : null,
              child: Text(s['payStart']),
            ),
          ],
        ),
      ),
    );
  }

  Widget _waitingCard(BuildContext context, AppStrings s) {
    return Center(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(
                s['purchaseWaiting'],
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                s['purchaseWaitingSub'],
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: context.brand.muted),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
FAIL=0
ok(){ printf '  OK %s\n' "$1"; }
bad(){ printf '  FAIL %s\n' "$1"; FAIL=1; }
note(){ printf '  - %s\n' "$1"; }
API="${DEEPDESK_BASE_URL:-https://deepdesk-o5kintt6za-du.a.run.app}"
echo "1. Version"
VER=$(sed -n 's/^version: *//p' pubspec.yaml); note "pubspec version: $VER"
grep -q 'FLUTTER_BUILD_NAME' ios/Runner/Info.plist && ok "Info.plist uses build name" || bad "Info.plist version binding missing"
echo "2. Privacy manifest"
grep -q 'PrivacyInfo.xcprivacy' ios/Runner.xcodeproj/project.pbxproj && ok "PrivacyInfo referenced" || bad "PrivacyInfo not referenced"
echo "3. Product IDs"
for id in deepdesk_light deepdesk_standard deepdesk_deep; do grep -q "$id" lib/core/config.dart && ok "$id" || bad "missing $id"; done
echo "4. Server configuration"
CFG=$(curl -fsS --max-time 45 "$API/api/config" 2>/dev/null || true)
printf '%s' "$CFG" | grep -q '"products"' && ok "config contains iap.products" || bad "config unreachable or incomplete"
echo "5. Bundle identifier"
grep -q 'PRODUCT_BUNDLE_IDENTIFIER = com.lightonpluslab.deepdesk;' ios/Runner.xcodeproj/project.pbxproj && ok "bundle id" || bad "bundle id mismatch"
echo "Manual final step: make one sandbox purchase before submission."
exit $FAIL

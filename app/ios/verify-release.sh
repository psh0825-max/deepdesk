#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."

OFFLINE=0
if [[ "${1:-}" == "--offline" ]]; then
  OFFLINE=1
elif [[ $# -gt 0 ]]; then
  printf 'FAIL unknown argument: %s\n' "$1"
  exit 2
fi

FAIL=0
pass(){ printf 'PASS %s\n' "$1"; }
bad(){ printf 'FAIL %s\n' "$1"; FAIL=1; }
API="${DEEPDESK_BASE_URL:-https://deepdesk-o5kintt6za-du.a.run.app}"
PBX='ios/Runner.xcodeproj/project.pbxproj'
PLIST='ios/Runner/Info.plist'

VERSION=$(sed -n 's/^version:[[:space:]]*//p' pubspec.yaml | head -n 1 | tr -d '\r')
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+\+[0-9]+$ ]] && pass "pubspec version parses ($VERSION)" || bad "pubspec version does not parse"

[[ $(grep -c 'TARGETED_DEVICE_FAMILY = 1;' "$PBX") -eq 3 ]] && pass "iPhone-only target family in all configurations" || bad "TARGETED_DEVICE_FAMILY must be 1 in all three configurations"
grep -q 'PrivacyInfo.xcprivacy' "$PBX" && pass "PrivacyInfo.xcprivacy referenced in project" || bad "PrivacyInfo.xcprivacy is not referenced in project"
grep -q 'PRODUCT_BUNDLE_IDENTIFIER = com.lightonpluslab.deepdesk;' "$PBX" && pass "bundle id com.lightonpluslab.deepdesk" || bad "bundle id mismatch"

if grep -A1 '<key>ITSAppUsesNonExemptEncryption</key>' "$PLIST" | grep -q '<false/>'; then
  pass "ITSAppUsesNonExemptEncryption is false"
else
  bad "ITSAppUsesNonExemptEncryption must be false"
fi

for id in deepdesk_light deepdesk_standard deepdesk_deep; do
  if grep -Eq "['\"]${id}['\"]" lib/core/config.dart; then
    pass "fallback product id $id"
  else
    bad "missing fallback product id $id"
  fi
done

if [[ $OFFLINE -eq 1 ]]; then
  pass "server /api/config check skipped (--offline)"
else
  CFG=$(curl -fsS --max-time 45 "$API/api/config" 2>/dev/null || true)
  if printf '%s' "$CFG" | grep -Eq '"iap"[[:space:]]*:[[:space:]]*\{[^}]*"products"'; then
    pass "server /api/config exposes iap.products"
  else
    bad "server /api/config unreachable or missing iap.products"
  fi
fi

exit "$FAIL"

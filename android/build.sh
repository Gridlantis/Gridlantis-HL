#!/usr/bin/env bash
# Builds the Open HL Android app into android/dist/OpenHL-<version>.apk.
#
# No Gradle: aapt2, javac, d8, zipalign and apksigner straight from the SDK.
# Needs a JDK 17 and an Android SDK with platforms;android-35 and
# build-tools;35.0.0. Defaults to ~/Android/jdk and ~/Android/Sdk.
#
# The signing key lives OUTSIDE the repo (~/Android/openhl-release.jks by
# default) and is made on first build. Its password comes from OPENHL_KEYPASS
# or is asked for; none is kept in the repo. Keep it: Android only installs an
# update over the old app when both are signed with the same key.
set -euo pipefail

VERSION="1.1.0"
VERSION_CODE=3
MIN_SDK=24
TARGET_SDK=34

HERE="$(cd "$(dirname "$0")" && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/Android/jdk}"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
KEYSTORE="${OPENHL_KEYSTORE:-$HOME/Android/openhl-release.jks}"
KEYPASS="${OPENHL_KEYPASS:-}"
PATH="$JAVA_HOME/bin:$PATH"

for f in "$BT/aapt2" "$BT/d8" "$BT/apksigner" "$BT/zipalign" "$JAR" "$JAVA_HOME/bin/javac"; do
  [ -e "$f" ] || { echo "Missing $f — see android/README.md for the toolchain." >&2; exit 1; }
done

B="$HERE/build"; OUT="$HERE/dist"
rm -rf "$B"; mkdir -p "$B/gen/local/openhl/app" "$B/classes" "$B/dex" "$OUT"

cat > "$B/gen/local/openhl/app/BuildInfo.java" <<EOF
package local.openhl.app;
final class BuildInfo { static final String VERSION = "$VERSION"; }
EOF

echo "→ resources"
"$BT/aapt2" compile --dir "$HERE/res" -o "$B/res.zip"
"$BT/aapt2" link -o "$B/unsigned.apk" -I "$JAR" \
  --manifest "$HERE/AndroidManifest.xml" -A "$HERE/assets" --java "$B/gen" \
  --min-sdk-version $MIN_SDK --target-sdk-version $TARGET_SDK \
  --version-code $VERSION_CODE --version-name $VERSION "$B/res.zip"

echo "→ java"
# Arrays, not $(find ...): the repo path may contain spaces.
mapfile -d '' SOURCES < <(find "$HERE/src" "$B/gen" -name '*.java' -print0)
javac -nowarn -source 11 -target 11 -encoding UTF-8 -Xlint:-options -classpath "$JAR" -d "$B/classes" "${SOURCES[@]}"
mapfile -d '' CLASSES < <(find "$B/classes" -name '*.class' -print0)
"$BT/d8" --release --min-api $MIN_SDK --lib "$JAR" --output "$B/dex" "${CLASSES[@]}"
(cd "$B/dex" && zip -q -u "$B/unsigned.apk" classes.dex)

echo "→ sign"
if [ -z "$KEYPASS" ]; then
  [ -t 0 ] || { echo "Set OPENHL_KEYPASS to the signing key's password." >&2; exit 1; }
  read -rsp "  signing key password: " KEYPASS; echo
  if [ ! -f "$KEYSTORE" ]; then read -rsp "  again: " again; echo; [ "$KEYPASS" = "$again" ] || { echo "Passwords differ." >&2; exit 1; }; fi
  [ ${#KEYPASS} -ge 6 ] || { echo "Use at least 6 characters (keytool's minimum)." >&2; exit 1; }
fi
if [ ! -f "$KEYSTORE" ]; then
  echo "  making signing key $KEYSTORE"
  keytool -genkeypair -keystore "$KEYSTORE" -alias openhl -keyalg RSA -keysize 3072 -validity 10000 \
    -storepass "$KEYPASS" -keypass "$KEYPASS" -dname "CN=Open HL" >/dev/null 2>&1
fi
"$BT/zipalign" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
APK="$OUT/OpenHL-$VERSION-android.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias openhl --min-sdk-version $MIN_SDK --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --ks-pass "pass:$KEYPASS" --key-pass "pass:$KEYPASS" \
  --out "$APK" "$B/aligned.apk"
"$BT/apksigner" verify "$APK"
rm -f "$APK.idsig"
echo "✓ $APK ($(du -h "$APK" | cut -f1))"

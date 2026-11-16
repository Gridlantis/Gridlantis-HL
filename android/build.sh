#!/usr/bin/env bash
# Builds the Metis Android app into android/dist/Metis-<version>.apk.
#
# No Gradle: aapt2, javac, d8, zipalign and apksigner straight from the SDK.
# Needs a JDK 17 and an Android SDK with platforms;android-35 and
# build-tools;35.0.0. Defaults to ~/Android/jdk and ~/Android/Sdk.
#
# The signing key lives OUTSIDE the repo (~/Android/metis-release.jks by
# default) and is made on first build. Keep it: Android only installs an
# update over the old app when both are signed with the same key.
set -euo pipefail

VERSION="1.0.1"
VERSION_CODE=2
MIN_SDK=24
TARGET_SDK=34

HERE="$(cd "$(dirname "$0")" && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/Android/jdk}"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
KEYSTORE="${METIS_KEYSTORE:-$HOME/Android/metis-release.jks}"
KEYPASS="${METIS_KEYPASS:-metis-android}"
PATH="$JAVA_HOME/bin:$PATH"

for f in "$BT/aapt2" "$BT/d8" "$BT/apksigner" "$BT/zipalign" "$JAR" "$JAVA_HOME/bin/javac"; do
  [ -e "$f" ] || { echo "Missing $f — see android/README.md for the toolchain." >&2; exit 1; }
done

B="$HERE/build"; OUT="$HERE/dist"
rm -rf "$B"; mkdir -p "$B/gen/local/metis/app" "$B/classes" "$B/dex" "$OUT"

cat > "$B/gen/local/metis/app/BuildInfo.java" <<EOF
package local.metis.app;
final class BuildInfo { static final String VERSION = "$VERSION"; }
EOF

echo "→ resources"
"$BT/aapt2" compile --dir "$HERE/res" -o "$B/res.zip"
"$BT/aapt2" link -o "$B/unsigned.apk" -I "$JAR" \
  --manifest "$HERE/AndroidManifest.xml" -A "$HERE/assets" --java "$B/gen" \
  --min-sdk-version $MIN_SDK --target-sdk-version $TARGET_SDK \
  --version-code $VERSION_CODE --version-name $VERSION "$B/res.zip"

echo "→ java"
javac -nowarn -source 11 -target 11 -encoding UTF-8 -Xlint:-options -classpath "$JAR" -d "$B/classes" \
  $(find "$HERE/src" "$B/gen" -name '*.java')
"$BT/d8" --release --min-api $MIN_SDK --lib "$JAR" --output "$B/dex" $(find "$B/classes" -name '*.class')
(cd "$B/dex" && zip -q -u "$B/unsigned.apk" classes.dex)

echo "→ sign"
if [ ! -f "$KEYSTORE" ]; then
  echo "  making signing key $KEYSTORE"
  keytool -genkeypair -keystore "$KEYSTORE" -alias metis -keyalg RSA -keysize 3072 -validity 10000 \
    -storepass "$KEYPASS" -keypass "$KEYPASS" -dname "CN=Metis" >/dev/null 2>&1
fi
"$BT/zipalign" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
APK="$OUT/Metis-$VERSION-android.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias metis --min-sdk-version $MIN_SDK --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --ks-pass "pass:$KEYPASS" --key-pass "pass:$KEYPASS" \
  --out "$APK" "$B/aligned.apk"
"$BT/apksigner" verify "$APK"
rm -f "$APK.idsig"
echo "✓ $APK ($(du -h "$APK" | cut -f1))"

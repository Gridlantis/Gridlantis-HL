# Gridlantis-HL for Android

Gridlantis-HL in its own app on a phone: a WebView around your Gridlantis-HL server, like the
desktop app. It remembers servers and the login, handles uploads and downloads
with your session, asks for the microphone or camera only when a page wants
them, and can pin a self-signed HTTPS certificate. Sidebar → **Switch server**
goes back to the connect screen.

## Build

```sh
android/build.sh      # → android/dist/OpenHL-<version>-android.apk
```

Gridlantis-HL serves the APK at `/download#android` (sidebar → Get the app → Android app).

No Gradle. The script needs JDK 17 at `~/Android/jdk` and an Android SDK at
`~/Android/Sdk` with `platforms;android-35` and `build-tools;35.0.0`
(override with `JAVA_HOME` / `ANDROID_HOME`). To set them up:

```sh
mkdir -p ~/Android/jdk ~/Android/Sdk/cmdline-tools
curl -L "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse" | tar -xz -C ~/Android/jdk --strip-components=1
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
unzip commandlinetools-linux-*.zip -d ~/Android/Sdk/cmdline-tools && mv ~/Android/Sdk/cmdline-tools/cmdline-tools ~/Android/Sdk/cmdline-tools/latest
JAVA_HOME=~/Android/jdk ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=$HOME/Android/Sdk "platforms;android-35" "build-tools;35.0.0"
```

## Signing

The first build makes a signing key at `~/Android/openhl-release.jks` (outside
the repo; `OPENHL_KEYSTORE` overrides the path). Its password is read from
`OPENHL_KEYPASS`, or the build asks for it; the first build asks twice and that
password protects the new key. A key made before this change used the old
built-in password `openhl-android`: enter that, or change it with
`keytool -storepasswd` and `keytool -keypasswd -alias openhl`. Back the key up: phones
only accept an update signed with the same key, otherwise the old app has to be
uninstalled first. Bump `VERSION` and `VERSION_CODE` in `build.sh` for updates.

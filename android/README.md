# Metis for Android

Metis in its own app on a phone: a WebView around your Metis server, like the
desktop app. It remembers servers and the login, handles uploads and downloads
with your session, asks for the microphone or camera only when a page wants
them, and can pin a self-signed HTTPS certificate. Sidebar → **Switch server**
goes back to the connect screen.

## Build

```sh
android/build.sh      # → android/dist/Metis-<version>-android.apk
```

Metis serves the APK at `/download#android` (sidebar → Get the app → Android app).

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

The first build makes a signing key at `~/Android/metis-release.jks` (outside
the repo; `METIS_KEYSTORE` / `METIS_KEYPASS` override it). Back it up: phones
only accept an update signed with the same key, otherwise the old app has to be
uninstalled first. Bump `VERSION` and `VERSION_CODE` in `build.sh` for updates.

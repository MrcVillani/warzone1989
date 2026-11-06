#!/usr/bin/env bash
# Installa l'SDK Android minimo per costruire l'APK di Warzone 1989.
#   ANDROID_HOME (predefinito ~/android-sdk)
#     cmdline-tools/latest   strumenti a riga di comando (sdkmanager)
#     platform-tools         adb
#     platforms/android-35   piattaforma di compilazione
#     build-tools/35.0.0     aapt2, apksigner, d8…
# Si può rilanciare: salta quello che c'è già. Scrive anche android/local.properties.
# Dietro un proxy basta che Java lo conosca (https.proxyHost/https.proxyPort in JAVA_TOOL_OPTIONS).
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_HOME
REPO="https://dl.google.com/android/repository"
FALLBACK_ZIP="commandlinetools-linux-13114758_latest.zip"   # versione nota, se l'indice non si legge
PACKAGES=("platform-tools" "platforms;android-35" "build-tools;35.0.0")
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v java >/dev/null || { echo "Serve Java 17 o successivo (java non trovato)." >&2; exit 1; }
command -v curl >/dev/null || { echo "Serve curl." >&2; exit 1; }
command -v unzip >/dev/null || { echo "Serve unzip." >&2; exit 1; }

mkdir -p "$ANDROID_HOME"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

# 1. Command-line tools
if [ -x "$SDKMANAGER" ]; then
  echo "Command-line tools già presenti in $ANDROID_HOME/cmdline-tools/latest"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  zip="" sha=""
  if curl -fsSL "$REPO/repository2-3.xml" -o "$tmp/repo.xml"; then
    # Nel blocco "cmdline-tools;latest" prende l'archivio Linux e il suo SHA-1.
    read -r zip sha < <(awk '
      /<remotePackage[^>]*path="cmdline-tools;latest"/ { inpkg = 1 }
      inpkg && /<\/remotePackage>/ { inpkg = 0 }
      inpkg && /<checksum/ { gsub(/.*">|<\/checksum>.*/, ""); s = $0 }
      inpkg && /<url>commandlinetools-linux-/ { gsub(/.*<url>|<\/url>.*/, ""); print $0, s; exit }
    ' "$tmp/repo.xml") || true
  fi
  if [ -z "$zip" ]; then
    echo "Indice dei pacchetti non leggibile: uso $FALLBACK_ZIP"
    zip="$FALLBACK_ZIP" sha=""
  fi
  echo "Scarico $zip…"
  curl -fL --retry 3 "$REPO/$zip" -o "$tmp/tools.zip"
  if [ -n "$sha" ]; then
    echo "$sha  $tmp/tools.zip" | sha1sum -c --quiet - || { echo "SHA-1 del download non corrisponde." >&2; exit 1; }
  fi
  unzip -q "$tmp/tools.zip" -d "$tmp/x"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/x/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  echo "Command-line tools installati in $ANDROID_HOME/cmdline-tools/latest"
fi

# 2. sdkmanager usa il proxy di sistema di Java (JAVA_TOOL_OPTIONS), se c'è
SDK_ARGS=("--sdk_root=$ANDROID_HOME")

# 3. Licenze e pacchetti (sdkmanager salta i pacchetti già installati)
missing=()
[ -x "$ANDROID_HOME/platform-tools/adb" ] || missing+=("platform-tools")
[ -f "$ANDROID_HOME/platforms/android-35/android.jar" ] || missing+=("platforms;android-35")
[ -x "$ANDROID_HOME/build-tools/35.0.0/aapt2" ] || missing+=("build-tools;35.0.0")

yes | "$SDKMANAGER" "${SDK_ARGS[@]}" --licenses >/dev/null || true
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Installo: ${missing[*]}"
  yes | "$SDKMANAGER" "${SDK_ARGS[@]}" "${missing[@]}"
else
  echo "Pacchetti già presenti: ${PACKAGES[*]}"
fi

# 4. android/local.properties (non va nel repository)
if [ -d "$ROOT/android" ]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ROOT/android/local.properties"
fi

echo "SDK Android pronto in $ANDROID_HOME"

#!/usr/bin/env bash
# install-piper.sh — local neural TTS for Gridlantis-HL. No cloud, no DRM, no 403.
#
#   tools/tts/install-piper.sh
#
# Installs the piper binary and a British female voice (the closest thing to
# en-GB-SoniaNeural, which Microsoft has stopped serving to third-party clients).
set -euo pipefail

VOICE_DIR="${PIPER_VOICE_DIR:-$HOME/.local/share/piper-voices}"
VOICE="${1:-en_GB-jenny_dioco-medium}"
HF="https://huggingface.co/rhasspy/piper-voices/resolve/main"

echo "── Piper TTS installer ──────────────────────────────────"
echo "Voice dir : $VOICE_DIR"
echo "Voice     : $VOICE"
echo

# ── 1. the piper binary ──────────────────────────────────────
if command -v piper >/dev/null 2>&1; then
  echo "✓ piper already installed: $(command -v piper)"
else
  echo "→ Installing piper..."
  if command -v pipx >/dev/null 2>&1; then
    pipx install piper-tts
  elif command -v pip3 >/dev/null 2>&1; then
    pip3 install --user piper-tts || pip3 install --user --break-system-packages piper-tts
  else
    echo "✗ Need pipx or pip3. Try: sudo apt install pipx"
    exit 1
  fi
  export PATH="$HOME/.local/bin:$PATH"
  command -v piper >/dev/null 2>&1 || {
    echo "✗ piper installed but not on PATH."
    echo "  Add this to ~/.zshrc:  export PATH=\"\$HOME/.local/bin:\$PATH\""
    exit 1
  }
  echo "✓ piper installed"
fi

# ── 2. an audio player for WAV ───────────────────────────────
if ! command -v aplay >/dev/null 2>&1 && ! command -v paplay >/dev/null 2>&1; then
  echo "→ Installing an audio player (alsa-utils)..."
  sudo apt-get install -y alsa-utils || echo "⚠ Could not install alsa-utils — browser speech will still work"
fi

# ── 3. the voice model ───────────────────────────────────────
mkdir -p "$VOICE_DIR"

# Map voice id -> huggingface path:  en_GB-jenny_dioco-medium -> en/en_GB/jenny_dioco/medium
lang="${VOICE%%-*}"                 # en_GB
short="${lang%%_*}"                 # en
rest="${VOICE#*-}"                  # jenny_dioco-medium
name="${rest%-*}"                   # jenny_dioco
quality="${rest##*-}"               # medium
BASE="$HF/$short/$lang/$name/$quality/$VOICE"

# A half-finished download is the trap here: an interrupted run leaves a
# truncated .onnx that is non-empty, so a plain -s test says "already have it"
# and piper then dies with an unhelpful "INVALID_PROTOBUF: Protobuf parsing
# failed". Compare against the length the server reports instead, and re-fetch
# anything that does not match.
for ext in onnx onnx.json; do
  target="$VOICE_DIR/$VOICE.$ext"
  want="$(curl -sIL "$BASE.$ext" | awk 'BEGIN{IGNORECASE=1} /^content-length:/{n=$2} END{gsub(/\r/,"",n); print n}')"
  if [ -s "$target" ]; then
    got="$(wc -c < "$target" | tr -d ' ')"
    if [ -z "$want" ] || [ "$got" = "$want" ]; then
      echo "✓ have $VOICE.$ext"
      continue
    fi
    echo "! $VOICE.$ext is incomplete ($got of $want bytes) — downloading again"
    rm -f "$target"
  fi
  echo "→ Downloading $VOICE.$ext ..."
  curl -fL --retry 3 --retry-delay 2 --progress-bar -o "$target" "$BASE.$ext" || {
    echo "✗ Download failed: $BASE.$ext"
    echo "  Browse voices at https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB"
    rm -f "$target"
    exit 1
  }
  got="$(wc -c < "$target" | tr -d ' ')"
  if [ -n "$want" ] && [ "$got" != "$want" ]; then
    echo "✗ $VOICE.$ext came down short ($got of $want bytes) — run this script again"
    rm -f "$target"
    exit 1
  fi
done

# ── 4. prove it works ────────────────────────────────────────
echo
echo "→ Testing..."
echo "Gridlantis-HL online. Piper text to speech is working." \
  | piper --model "$VOICE_DIR/$VOICE.onnx" --output_file /tmp/piper-test.wav

if [ -s /tmp/piper-test.wav ]; then
  echo "✓ Synthesised $(du -h /tmp/piper-test.wav | cut -f1)"
  if command -v aplay >/dev/null 2>&1; then aplay -q /tmp/piper-test.wav || true
  elif command -v paplay >/dev/null 2>&1; then paplay /tmp/piper-test.wav || true
  fi
else
  echo "✗ piper produced no audio"
  exit 1
fi

cat <<EOF

────────────────────────────────────────────────────────────
✓ Piper is ready.

Gridlantis-HL picks it up automatically — ttsSettings() defaults to
"piper" whenever the binary is present.

To pin it explicitly, add to .env:
    PIPER_VOICE=$VOICE
    PIPER_VOICE_DIR=$VOICE_DIR

Other British voices (re-run this script with the name):
    tools/tts/install-piper.sh en_GB-cori-high                 # higher quality, bigger
    tools/tts/install-piper.sh en_GB-alba-medium               # Scottish female
    tools/tts/install-piper.sh en_GB-northern_english_male-medium

Verify:  curl -s localhost:3000/api/tts/config | jq .engines.piper
────────────────────────────────────────────────────────────
EOF

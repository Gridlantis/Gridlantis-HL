#!/usr/bin/env bash
# Build Gridlantis-HL's patched Syncthing for live folders.
#
#   tools/live/build-syncthing.sh        # → live/dist/syncthing-<os>-<arch>-<VERSION>.{tar.gz,zip}
#
# Upstream Syncthing loses an edit when three or more devices change the same
# file within the same second: the two losers name their conflict copies
# identically (time to the second + the winner's ID), the copies then
# conflict with each other, and Syncthing deletes one outright.
# syncthing-conflicts.patch (next to this script) names each copy after the
# device that makes it too, and archives a replaced conflict copy with the
# folder's versioning instead of deleting it. Since every losing device now
# makes its own copy, the same edit can end up copied two or three times, so
# the patch also removes conflict copies whose content is identical to an
# older copy of the same file (openhl.2). No upstream fix exists (checked
# 2026-11-15; #2605 introduced the delete on purpose).
#
# Downloads a pinned Go toolchain (checked against SHA-256) and the Syncthing
# source at the tag into live/, applies the patch, runs Syncthing's own model and
# versioner tests, and builds Linux amd64/arm64 and Windows amd64. Gridlantis-HL
# (src/domains/live/syncthing.js) runs and serves these builds.
set -euo pipefail

ST_TAG=v2.1.7
BUILD_VERSION="$ST_TAG-openhl.2"
GO_VERSION=go1.27.4
GO_SHA=7226736c2339719cda28fbf3a54d71aa63bcefe376e98cef00034268dab24840
TARGETS="linux/amd64 linux/arm64 windows/amd64"

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
LIVE="$ROOT/live"
TOOL="$LIVE/toolchain"
WORK="$LIVE/build"
DIST="$LIVE/dist"
PATCH="$HERE/syncthing-conflicts.patch"
SRC="$WORK/syncthing-${ST_TAG#v}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
mkdir -p "$TOOL" "$WORK" "$DIST"

# Go toolchain (official build, pinned).
if [ ! -x "$TOOL/go/bin/go" ] || ! "$TOOL/go/bin/go" version | grep -q "$GO_VERSION "; then
  say "Downloading $GO_VERSION"
  rm -rf "$TOOL/go"
  curl -fsSL -o "$TOOL/go.tgz" "https://dl.google.com/go/$GO_VERSION.linux-amd64.tar.gz"
  echo "$GO_SHA  $TOOL/go.tgz" | sha256sum -c --quiet || die "the Go download did not match its checksum"
  tar -xzf "$TOOL/go.tgz" -C "$TOOL" && rm -f "$TOOL/go.tgz"
fi
export PATH="$TOOL/go/bin:$PATH" GOPATH="$WORK/gopath" GOCACHE="$WORK/gocache" GOFLAGS=-mod=mod GOTOOLCHAIN=local

# Syncthing source at the tag, fresh each time so the patch applies cleanly.
say "Fetching Syncthing $ST_TAG source"
rm -rf "$SRC"
curl -fsSL -o "$WORK/src.tgz" "https://github.com/syncthing/syncthing/archive/refs/tags/$ST_TAG.tar.gz"
tar -xzf "$WORK/src.tgz" -C "$WORK" && rm -f "$WORK/src.tgz"

say "Applying syncthing-conflicts.patch"
patch -d "$SRC" -p1 --forward < "$PATCH" || die "the patch no longer applies to $ST_TAG"

say "Running Syncthing's model and versioner tests"
(cd "$SRC" && go test ./lib/model/ ./lib/versioner/ -count=1)

for t in $TARGETS; do
  os="${t%/*}"; arch="${t#*/}"
  say "Building $os/$arch"
  if [ "$os" = windows ]; then kind=zip; else kind=tar; fi
  (cd "$SRC" && go run build.go -version "$BUILD_VERSION" -no-upgrade -goos "$os" -goarch "$arch" "$kind" >/dev/null)
  ext=$([ "$kind" = zip ] && echo zip || echo tar.gz)
  mv -f "$SRC/syncthing-$os-$arch-$BUILD_VERSION.$ext" "$DIST/"
  echo "   $DIST/syncthing-$os-$arch-$BUILD_VERSION.$ext"
done
say "Done — restart Gridlantis-HL (systemctl --user restart openhl) to roll it out"

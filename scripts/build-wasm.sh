#!/usr/bin/env bash
# Builds the browser demo parser (wasm/) into web/src/parse/demoparser.
# Needs: rustup with the wasm32-unknown-unknown target, wasm-pack, protoc (or $PROTOC), git.
set -euo pipefail

# Same parser version as the native @laihoe/demoparser2 used by the desktop app.
DEMOPARSER_REPO=https://github.com/LaihoE/demoparser.git
DEMOPARSER_COMMIT=d3767705dc5846d73ed29db50eaeda58778dc934 # v0.42.0
# The parser's build script compiles Valve's protobufs from the latest GameTracking-CS2 commit, which breaks with
# newer upstream changes. Pin the last protobuf update before v0.42.0 was released.
GAMETRACKING_REPO=https://github.com/SteamDatabase/GameTracking-CS2.git
GAMETRACKING_COMMIT=39df8b2a5bdd43f358c0a63a92adee2e220db505

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VENDOR=$ROOT/wasm/vendor/demoparser
OUT=$ROOT/web/src/parse/demoparser
STAMP="$DEMOPARSER_COMMIT $GAMETRACKING_COMMIT $(git hash-object "$ROOT/wasm/demoparser.patch")"

fetch() { # <repo> <commit> <dir>
  rm -rf "$3"
  mkdir -p "$3"
  git -C "$3" init -q
  git -C "$3" fetch -q --depth 1 "$1" "$2"
  git -C "$3" checkout -q FETCH_HEAD
}

if [[ "$(cat "$VENDOR/.replay2d-stamp" 2>/dev/null)" != "$STAMP" ]]; then
  echo "Fetching demoparser $DEMOPARSER_COMMIT"
  fetch "$DEMOPARSER_REPO" "$DEMOPARSER_COMMIT" "$VENDOR"
  fetch "$GAMETRACKING_REPO" "$GAMETRACKING_COMMIT" "$VENDOR/src/csgoproto/GameTracking-CS2"
  git -C "$VENDOR" apply "$ROOT/wasm/demoparser.patch"
  echo "$STAMP" > "$VENDOR/.replay2d-stamp"
fi

if [[ -z "${PROTOC:-}" ]] && ! command -v protoc > /dev/null; then
  echo "protoc not found: install protobuf or set PROTOC=/path/to/protoc" >&2
  exit 1
fi

wasm-pack build "$ROOT/wasm" --release --target web --no-pack --out-dir "$OUT" --out-name demoparser
rm -f "$OUT/.gitignore"

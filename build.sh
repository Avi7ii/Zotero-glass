#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE="$ROOT/zotero-glass-plugin"
DIST="$ROOT/dist"
VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$SOURCE/manifest.json")
OUTPUT="$DIST/Zotero-Glass-$VERSION.xpi"

python3 -m unittest discover -s "$ROOT/tests" -v
node "$ROOT/tests/test_style_lifecycle.js"
mkdir -p "$DIST"
rm -f "$OUTPUT"

(
  cd "$SOURCE"
  zip -X -q "$OUTPUT" \
    bootstrap.js \
    manifest.json \
    chrome/content/zoteroGlass.js \
    chrome/content/glass.css \
    chrome/content/preferences.xhtml \
    chrome/content/preferences.css \
    chrome/content/zotero-glass.svg
)

unzip -t "$OUTPUT"
shasum -a 256 "$OUTPUT"
printf '\nBuilt %s\n' "$OUTPUT"

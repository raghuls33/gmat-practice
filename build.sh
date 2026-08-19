#!/bin/sh
# Inline src/{styles.css,data.json,app.js} into a single self-contained
# dist/dMAT_Practice_Suite.html. POSIX sh, no dependencies, no toolchain.
#
# It scans src/index.html for the marker comments __CSS__, __DATA__ and __JS__
# and replaces those whole lines with the file contents. Nothing is escaped or
# rewritten, so src/data.json is copied through byte for byte.
set -e

cd "$(dirname "$0")"
SRC=src
OUT=dist
FILE=$OUT/dMAT_Practice_Suite.html

for f in "$SRC/index.html" "$SRC/styles.css" "$SRC/app.js" "$SRC/data.json"; do
  [ -f "$f" ] || { echo "build: missing $f" >&2; exit 1; }
done

mkdir -p "$OUT"
: > "$FILE.tmp"

while IFS= read -r line || [ -n "$line" ]; do
  case $line in
    *__CSS__*)
      printf '<style>\n' >> "$FILE.tmp"
      cat "$SRC/styles.css"  >> "$FILE.tmp"
      printf '</style>\n'   >> "$FILE.tmp"
      ;;
    *__DATA__*)
      printf '<script id="dmat-data" type="application/json">' >> "$FILE.tmp"
      cat "$SRC/data.json"   >> "$FILE.tmp"
      printf '</script>\n'  >> "$FILE.tmp"
      ;;
    *__JS__*)
      printf '<script>\n'    >> "$FILE.tmp"
      cat "$SRC/app.js"      >> "$FILE.tmp"
      printf '</script>\n'  >> "$FILE.tmp"
      ;;
    *)
      printf '%s\n' "$line"  >> "$FILE.tmp"
      ;;
  esac
done < "$SRC/index.html"

# A stray </script> inside the JSON would end the data block early.
if grep -q '</script' "$SRC/data.json"; then
  echo "build: src/data.json contains </script — refusing to inline" >&2
  rm -f "$FILE.tmp"; exit 1
fi

mv "$FILE.tmp" "$FILE"
# GitHub Pages needs an index; serve the same single file.
cp "$FILE" "$OUT/index.html"
echo "build: wrote $FILE ($(wc -c < "$FILE") bytes)"

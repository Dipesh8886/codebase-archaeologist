#!/usr/bin/env bash
# Downloads pre-built Tree-sitter WASM grammars from the tree-sitter-wasms
# npm package (published free, MIT-licensed) instead of compiling grammars
# from source at build time — keeps the Render free-tier build fast and
# avoids needing emscripten in the build image.
set -euo pipefail

mkdir -p grammars
cd grammars

LANGUAGES=(javascript typescript tsx python go java ruby rust c cpp)

# tree-sitter-wasms ships one npm package containing every grammar's .wasm
# file — we just need to unpack the ones we use.
TMP_DIR=$(mktemp -d)
npm pack tree-sitter-wasms --pack-destination "$TMP_DIR" > /dev/null
tar -xzf "$TMP_DIR"/tree-sitter-wasms-*.tgz -C "$TMP_DIR"

for lang in "${LANGUAGES[@]}"; do
  src="$TMP_DIR/package/out/tree-sitter-${lang}.wasm"
  if [ -f "$src" ]; then
    cp "$src" "./tree-sitter-${lang}.wasm"
    echo "fetched grammar: $lang"
  else
    echo "WARNING: grammar not found for $lang — files of this language will fall back to line-based chunking"
  fi
done

rm -rf "$TMP_DIR"
echo "Grammar fetch complete: $(ls -1 . | wc -l) grammars in ./grammars"

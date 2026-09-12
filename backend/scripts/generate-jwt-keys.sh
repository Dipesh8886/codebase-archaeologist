#!/usr/bin/env bash
# Generates an RS256 keypair for JWT signing and prints the base64 values
# to paste into .env as JWT_PRIVATE_KEY_BASE64 / JWT_PUBLIC_KEY_BASE64.
set -euo pipefail

TMP_DIR=$(mktemp -d)
openssl genrsa -out "$TMP_DIR/private.pem" 2048 2>/dev/null
openssl rsa -in "$TMP_DIR/private.pem" -pubout -out "$TMP_DIR/public.pem" 2>/dev/null

echo "JWT_PRIVATE_KEY_BASE64=$(base64 -w 0 "$TMP_DIR/private.pem" 2>/dev/null || base64 -i "$TMP_DIR/private.pem")"
echo "JWT_PUBLIC_KEY_BASE64=$(base64 -w 0 "$TMP_DIR/public.pem" 2>/dev/null || base64 -i "$TMP_DIR/public.pem")"

rm -rf "$TMP_DIR"

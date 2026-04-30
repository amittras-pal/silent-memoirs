#!/usr/bin/env bash
# =============================================================================
# Silent Memoirs — Vault Decryption Script (macOS / Linux)
# =============================================================================
# This script decrypts your Silent Memoirs vault entries and media files.
#
# Prerequisites:
#   1. Install the 'age' CLI tool:
#      - macOS:  brew install age
#      - Linux:  https://github.com/FiloSottile/age (see releases)
#   2. Place your recovery key in a file named 'identity.txt' in the same
#      directory as this script. The file should contain only your key
#      starting with AGE-SECRET-KEY-...
#
# Usage:
#   chmod +x decrypt-vault.sh
#   ./decrypt-vault.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_DIR="$SCRIPT_DIR"
IDENTITY_FILE="$VAULT_DIR/identity.txt"
OUTPUT_DIR="$VAULT_DIR/decrypted"

# --- Pre-flight checks -------------------------------------------------------

echo "Silent Memoirs — Vault Decryption"
echo "============================================"
echo ""

# Check for age CLI
if ! command -v age &>/dev/null; then
  echo "ERROR: 'age' command not found."
  echo ""
  echo "Please install the age encryption tool first:"
  echo "  macOS:  brew install age"
  echo "  Linux:  See https://github.com/FiloSottile/age/releases"
  echo ""
  exit 1
fi

echo "[OK] age CLI found: $(command -v age)"

# Check for identity file
if [ ! -f "$IDENTITY_FILE" ]; then
  echo ""
  echo "ERROR: Identity file not found."
  echo ""
  echo "Please create a file named 'identity.txt' in this directory:"
  echo "  $IDENTITY_FILE"
  echo ""
  echo "The file should contain only your 128-character recovery key"
  echo "starting with AGE-SECRET-KEY-..."
  echo ""
  exit 1
fi

# Validate identity file content
FIRST_LINE=$(head -n 1 "$IDENTITY_FILE" | tr -d '[:space:]')
if [[ ! "$FIRST_LINE" =~ ^AGE-SECRET-KEY- ]]; then
  echo ""
  echo "ERROR: identity.txt does not appear to contain a valid age secret key."
  echo "The key must start with 'AGE-SECRET-KEY-'."
  echo ""
  exit 1
fi

echo "[OK] Identity file found"

# Check for python3 or jq (needed to parse entry JSON)
JSON_PARSER=""
if command -v python3 &>/dev/null; then
  JSON_PARSER="python3"
elif command -v jq &>/dev/null; then
  JSON_PARSER="jq"
else
  echo ""
  echo "ERROR: Neither python3 nor jq found."
  echo "One of these is required to extract entry content from JSON."
  echo "Install python3 or jq and try again."
  echo ""
  exit 1
fi

echo "[OK] JSON parser: $JSON_PARSER"
echo ""

# --- Create output directory --------------------------------------------------

mkdir -p "$OUTPUT_DIR"
echo "Output directory: $OUTPUT_DIR"
echo ""

# --- Decrypt files ------------------------------------------------------------

ENTRIES_OK=0
ENTRIES_FAIL=0
MEDIA_OK=0
MEDIA_FAIL=0

# Process entry files: YYYY/YYYY-MM-DD_HH-MM.age
while IFS= read -r encrypted_file; do
  rel_path="${encrypted_file#"$VAULT_DIR/"}"
  out_rel="${rel_path%.age}.md"
  out_file="$OUTPUT_DIR/$out_rel"

  mkdir -p "$(dirname "$out_file")"

  tmp_file=$(mktemp)
  if age -d -i "$IDENTITY_FILE" "$encrypted_file" > "$tmp_file" 2>/dev/null; then
    extract_ok=false

    if [ "$JSON_PARSER" = "python3" ]; then
      if python3 -c "
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
content = data.get('plaintext', '')
sys.stdout.write(content)
" "$tmp_file" > "$out_file" 2>/dev/null; then
        extract_ok=true
      fi
    else
      if jq -r '.plaintext // ""' "$tmp_file" > "$out_file" 2>/dev/null; then
        extract_ok=true
      fi
    fi

    if [ "$extract_ok" = true ]; then
      echo "  [ENTRY OK] $rel_path -> $out_rel"
      ENTRIES_OK=$((ENTRIES_OK + 1))
    else
      echo "  [ENTRY FAIL] $rel_path (JSON parse error)"
      rm -f "$out_file"
      ENTRIES_FAIL=$((ENTRIES_FAIL + 1))
    fi
  else
    echo "  [ENTRY FAIL] $rel_path (decryption error)"
    ENTRIES_FAIL=$((ENTRIES_FAIL + 1))
  fi
  rm -f "$tmp_file"
done < <(find "$VAULT_DIR" -mindepth 2 -type f -name "*.age" \
  ! -path "*/media/*" \
  -path "*/[0-9][0-9][0-9][0-9]/*" | sort)

# Process media files: YYYY/media/*.{png,webp,jpg,jpeg,avif}
while IFS= read -r encrypted_file; do
  rel_path="${encrypted_file#"$VAULT_DIR/"}"
  out_file="$OUTPUT_DIR/$rel_path"

  mkdir -p "$(dirname "$out_file")"

  if age -d -i "$IDENTITY_FILE" "$encrypted_file" > "$out_file" 2>/dev/null; then
    echo "  [MEDIA OK] $rel_path"
    MEDIA_OK=$((MEDIA_OK + 1))
  else
    echo "  [MEDIA FAIL] $rel_path"
    rm -f "$out_file"
    MEDIA_FAIL=$((MEDIA_FAIL + 1))
  fi
done < <(find "$VAULT_DIR" -mindepth 3 -type f -path "*/media/*" \
  \( -iname "*.png" -o -iname "*.webp" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.avif" \) | sort)

echo ""
echo "============================================"
echo "Decryption complete!"
echo ""
echo "  Entries:  $ENTRIES_OK succeeded, $ENTRIES_FAIL failed"
echo "  Media:    $MEDIA_OK succeeded, $MEDIA_FAIL failed"
echo ""
echo "Decrypted files are in: $OUTPUT_DIR"
echo ""

if [ $ENTRIES_FAIL -gt 0 ] || [ $MEDIA_FAIL -gt 0 ]; then
  echo "NOTE: Some files could not be decrypted. They may be corrupted"
  echo "or your identity key may not match this vault."
  exit 1
fi

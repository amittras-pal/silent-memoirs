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
#
#   Alternative (no chmod needed):
#     bash decrypt-vault.sh
#
#   macOS users: If you see a Gatekeeper warning, run first:
#     xattr -d com.apple.quarantine decrypt-vault.sh
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

# --- Detect parallelism -------------------------------------------------------

NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
NPROC=$((NPROC > 16 ? 16 : NPROC))

# Check if xargs supports -P (parallel)
USE_PARALLEL=false
if echo "" | xargs -P 1 echo "" &>/dev/null 2>&1; then
  USE_PARALLEL=true
fi

if [ "$USE_PARALLEL" = true ] && [ "$NPROC" -gt 1 ]; then
  echo "[INFO] Using $NPROC parallel threads"
else
  echo "[INFO] Running sequentially"
fi
echo ""

# --- Build work manifest ------------------------------------------------------

MANIFEST_FILE=$(mktemp)
STATUS_DIR=$(mktemp -d)
trap 'rm -rf "$MANIFEST_FILE" "$STATUS_DIR"' EXIT

TOTAL=0

# Collect entry files: YYYY/*.age
while IFS= read -r encrypted_file; do
  echo "entry|$encrypted_file" >> "$MANIFEST_FILE"
  TOTAL=$((TOTAL + 1))
done < <(find "$VAULT_DIR" -mindepth 2 -type f -name "*.age" \
  ! -path "*/media/*" \
  -path "*/[0-9][0-9][0-9][0-9]/*" | sort)

# Collect media files: YYYY/media/*.{png,webp,jpg,jpeg,avif}
while IFS= read -r encrypted_file; do
  echo "media|$encrypted_file" >> "$MANIFEST_FILE"
  TOTAL=$((TOTAL + 1))
done < <(find "$VAULT_DIR" -mindepth 3 -type f -path "*/media/*" \
  \( -iname "*.png" -o -iname "*.webp" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.avif" \) | sort)

if [ "$TOTAL" -eq 0 ]; then
  echo "No encrypted files found in vault."
  echo ""
  exit 0
fi

echo "Found $TOTAL files to decrypt."
echo ""
echo -n "Press any key to begin decryption..."
read -rsn1
echo ""
echo ""
# --- Decrypt function ---------------------------------------------------------

decrypt_one() {
  local line="$1"
  local vault_dir="$2"
  local identity_file="$3"
  local output_dir="$4"
  local json_parser="$5"
  local status_dir="$6"

  local item_type="${line%%|*}"
  local encrypted_file="${line#*|}"
  local rel_path="${encrypted_file#"$vault_dir"/}"

  # Generate a unique status file name
  local status_file
  status_file="$status_dir/$(echo "$rel_path" | tr '/' '_')"

  if [ "$item_type" = "entry" ]; then
    local out_rel="${rel_path%.age}.md"
    local out_file="$output_dir/$out_rel"
    mkdir -p "$(dirname "$out_file")"

    local tmp_file
    tmp_file=$(mktemp)
    if age -d -i "$identity_file" "$encrypted_file" > "$tmp_file" 2>/dev/null; then
      local extract_ok=false

      if [ "$json_parser" = "python3" ]; then
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
        echo "entry_ok" > "$status_file"
      else
        echo "entry_fail|$rel_path (JSON parse error)" > "$status_file"
        rm -f "$out_file"
      fi
    else
      echo "entry_fail|$rel_path (decryption error)" > "$status_file"
    fi
    rm -f "$tmp_file"

  else
    # Media file
    local out_file="$output_dir/$rel_path"
    mkdir -p "$(dirname "$out_file")"

    if age -d -i "$identity_file" "$encrypted_file" > "$out_file" 2>/dev/null; then
      echo "media_ok" > "$status_file"
    else
      echo "media_fail|$rel_path" > "$status_file"
      rm -f "$out_file"
    fi
  fi
}

export -f decrypt_one

# --- Progress bar function ----------------------------------------------------

show_progress() {
  local current=$1 total=$2
  if [ "$total" -eq 0 ]; then return; fi
  local pct=$((current * 100 / total))
  local bar_width=40
  local filled=$((pct * bar_width / 100))
  local empty=$((bar_width - filled))
  local filled_bar=""
  local empty_bar=""
  local i
  for ((i = 0; i < filled; i++)); do filled_bar+="█"; done
  for ((i = 0; i < empty; i++)); do empty_bar+="░"; done
  printf "\r  %s%s  %3d%%  (%d/%d)" "$filled_bar" "$empty_bar" "$pct" "$current" "$total"
}

# --- Decrypt files ------------------------------------------------------------

if [ "$USE_PARALLEL" = true ] && [ "$NPROC" -gt 1 ]; then
  # Parallel execution with xargs -P
  # We run decrypt_one for each line in the manifest
  cat "$MANIFEST_FILE" | xargs -P "$NPROC" -I {} bash -c \
    'decrypt_one "$@"' _ {} "$VAULT_DIR" "$IDENTITY_FILE" "$OUTPUT_DIR" "$JSON_PARSER" "$STATUS_DIR"

  # Show final progress (100%)
  show_progress "$TOTAL" "$TOTAL"
  echo ""
else
  # Sequential execution with progress bar
  COMPLETED=0
  while IFS= read -r line; do
    decrypt_one "$line" "$VAULT_DIR" "$IDENTITY_FILE" "$OUTPUT_DIR" "$JSON_PARSER" "$STATUS_DIR"
    COMPLETED=$((COMPLETED + 1))
    show_progress "$COMPLETED" "$TOTAL"
  done < "$MANIFEST_FILE"
  echo ""
fi

# --- Aggregate results --------------------------------------------------------

ENTRIES_OK=0
ENTRIES_FAIL=0
MEDIA_OK=0
MEDIA_FAIL=0
FAILED_FILES=()

for status_file in "$STATUS_DIR"/*; do
  [ -f "$status_file" ] || continue
  status=$(cat "$status_file")
  case "$status" in
    entry_ok)    ENTRIES_OK=$((ENTRIES_OK + 1)) ;;
    media_ok)    MEDIA_OK=$((MEDIA_OK + 1)) ;;
    entry_fail*) ENTRIES_FAIL=$((ENTRIES_FAIL + 1)); FAILED_FILES+=("${status#*|}") ;;
    media_fail*) MEDIA_FAIL=$((MEDIA_FAIL + 1)); FAILED_FILES+=("${status#*|}") ;;
  esac
done

# --- Summary ------------------------------------------------------------------

echo ""
echo "============================================"
echo "Decryption complete!"
echo ""
echo "  Entries:  $ENTRIES_OK succeeded, $ENTRIES_FAIL failed"
echo "  Media:    $MEDIA_OK succeeded, $MEDIA_FAIL failed"
echo ""
echo "Decrypted files are in: $OUTPUT_DIR"
echo ""

if [ ${#FAILED_FILES[@]} -gt 0 ]; then
  echo "Failed files:"
  for f in "${FAILED_FILES[@]}"; do
    echo "  [FAIL] $f"
  done
  echo ""
  echo "NOTE: These files may be corrupted or your identity key"
  echo "may not match this vault."
  exit 1
fi

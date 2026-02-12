#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "[ERROR] Missing required command: rg"
  exit 2
fi

if ! command -v xmllint >/dev/null 2>&1; then
  echo "[ERROR] Missing required command: xmllint"
  exit 2
fi

shopt -s nullglob
html_files=(*.html)
js_files=(assets/js/*.js)
shopt -u nullglob

if [[ ${#html_files[@]} -eq 0 ]]; then
  echo "[ERROR] No HTML files found in $ROOT_DIR"
  exit 2
fi

fail=0

echo "1) Checking HTML parser-critical errors..."
for file in "${html_files[@]}"; do
  output="$(xmllint --html --noout "$file" 2>&1 || true)"
  critical="$(printf '%s\n' "$output" | rg 'Unexpected end tag|Opening and ending tag mismatch|htmlParseEntityRef|Premature end of data|Start tag expected' || true)"
  if [[ -n "$critical" ]]; then
    echo "  [FAIL] $file"
    printf '%s\n' "$critical" | sed 's/^/    /'
    fail=1
  fi
done

echo "2) Checking per-page UI/nav invariants..."
for file in "${html_files[@]}"; do
  field_ui_count="$(rg -o '<div class="fieldUI"' "$file" | wc -l | tr -d ' ')"
  if [[ "$field_ui_count" != "1" ]]; then
    echo "  [FAIL] $file has $field_ui_count field control panels (expected 1)"
    fail=1
  fi

  current_count="$(rg -o 'aria-current="page"' "$file" | wc -l | tr -d ' ')"
  if [[ "$current_count" != "1" ]]; then
    echo "  [FAIL] $file has $current_count active nav items (expected 1)"
    fail=1
  fi
done

echo "3) Checking local href/src targets..."
for file in "${html_files[@]}"; do
  while IFS= read -r pair; do
    value="${pair#*=}"
    value="${value#\"}"
    value="${value%\"}"

    case "$value" in
      ""|http:*|https:*|mailto:*|tel:*|data:*|\#*|javascript:*)
        continue
        ;;
    esac

    path="${value%%\#*}"
    path="${path%%\?*}"
    [[ -z "$path" ]] && continue

    if [[ ! -e "$path" ]]; then
      echo "  [FAIL] $file references missing path: $path"
      fail=1
    fi
  done < <(rg -o '(href|src)="[^"]+"' "$file")
done

echo "4) Checking JS syntax (if node is available)..."
if command -v node >/dev/null 2>&1; then
  for file in "${js_files[@]}"; do
    if ! node --check "$file" >/dev/null 2>&1; then
      echo "  [FAIL] JS parse failed: $file"
      fail=1
    fi
  done
else
  echo "  [WARN] node not found; skipped JS syntax check"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "Validation FAILED."
  exit 1
fi

echo "Validation PASSED."

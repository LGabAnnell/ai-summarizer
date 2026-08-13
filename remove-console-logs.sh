#!/bin/bash

# Script to remove all console.log statements from code files
# Usage: ./remove-console-logs.sh [--dry-run] [directory]

set -euo pipefail

DRY_RUN=false
TARGET_DIR="."

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      TARGET_DIR="$arg"
      ;;
  esac
done

# File extensions to search
EXTENSIONS=("ts" "js" "html" "tsx" "jsx")

echo "Searching for console.log statements in ${TARGET_DIR}..."

# Find files with console.log
FILES_WITH_CONSOLE_LOG=()
while IFS= read -r -d '' file; do
  FILES_WITH_CONSOLE_LOG+=("$file")
done < <(find "$TARGET_DIR" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.html" -o -name "*.tsx" -o -name "*.jsx" \) -print0)

if [ ${#FILES_WITH_CONSOLE_LOG[@]} -eq 0 ]; then
  echo "No console.log statements found."
  exit 0
fi

echo "Found console.log in ${#FILES_WITH_CONSOLE_LOG[@]} file(s):"
for file in "${FILES_WITH_CONSOLE_LOG[@]}"; do
  COUNT=$(grep -c "console\.log" "$file" 2>/dev/null || echo 0)
  echo "  $file ($COUNT occurrences)"
done

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "Dry run complete. Use without --dry-run to actually remove statements."
  exit 0
fi

echo ""
read -p "Remove all console.log statements from these files? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Remove console.log statements
for file in "${FILES_WITH_CONSOLE_LOG[@]}"; do
  # Use sed to remove lines containing console.log
  # Handles: console.log(...), console.log ..., console.log(...);
  sed -i -E '/console\.log\(.*\)/d' "$file"
  echo "  Cleaned: $file"
done

echo ""
echo "Done! Removed console.log statements from ${#FILES_WITH_CONSOLE_LOG[@]} file(s)."

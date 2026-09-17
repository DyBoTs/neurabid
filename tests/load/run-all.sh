#!/usr/bin/env bash
# Runs all 5 load test stages in order, with the real database correctness
# checker run after every single one. Stops immediately if a stage's
# correctness check actually fails — never continues past a real violation.
#
# Usage: tests/load/run-all.sh /path/to/k6.exe
set -euo pipefail

K6_BIN="${1:-k6}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

for stage in 1 2 3 4 5; do
  echo ""
  echo "=================================================================="
  echo "STAGE $stage"
  echo "=================================================================="
  "$K6_BIN" run -e STAGE="$stage" "$SCRIPT_DIR/bidding.js" \
    --summary-export "$RESULTS_DIR/stage-$stage-summary.json" \
    | tee "$RESULTS_DIR/stage-$stage-output.txt"

  echo ""
  echo "--- Correctness check after stage $stage ---"
  node "$SCRIPT_DIR/check-correctness.mjs" | tee "$RESULTS_DIR/stage-$stage-correctness.txt"
done

echo ""
echo "All 5 stages complete. Raw results saved in $RESULTS_DIR (gitignored)."

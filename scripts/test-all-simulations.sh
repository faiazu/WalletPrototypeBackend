#!/bin/bash

# Comprehensive Simulation Test Suite
# Tests multiple scenarios to validate end-to-end system behavior

set -e

RESULTS_DIR="simulation-results"
mkdir -p "$RESULTS_DIR"

PASS_COUNT=0
FAIL_COUNT=0

function run_test() {
  local test_name="$1"
  local test_cmd="$2"
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧪 TEST: $test_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if eval "$test_cmd" > /dev/null 2>&1; then
    echo "✅ PASS: $test_name"
    ((PASS_COUNT++))
    return 0
  else
    echo "❌ FAIL: $test_name"
    ((FAIL_COUNT++))
    return 1
  fi
}

echo "🚀 Starting Comprehensive Simulation Test Suite"
echo "================================================"

# Test 1: Default Configuration
run_test "Default configuration" \
  "npm run simulate"

# Test 2: Small amounts (minimum viable)
run_test "Small amounts (minimum $10 transactions)" \
  "npm run simulate -- --deposit-amount 2000 --spend-amount 500 --funding-amount 1000 --withdrawal-amount 1000"

# Test 3: Large amounts (testing high-value transactions)
run_test "Large amounts ($10k deposit, $1k spend)" \
  "npm run simulate -- --deposit-amount 1000000 --spend-amount 100000 --funding-amount 50000 --withdrawal-amount 50000"

# Test 4: Different wallet name
run_test "Custom wallet name" \
  "npm run simulate -- --wallet-name 'Integration Test Wallet'"

# Test 5: Skip withdrawal flow
run_test "Skip withdrawal (faster run)" \
  "npm run simulate -- --skip-withdrawal"

# Test 6: Export results to JSON
run_test "Export results to JSON" \
  "npm run simulate -- --export '$RESULTS_DIR/test-export.json'"

# Test 7: Verbose mode
run_test "Verbose logging mode" \
  "npm run simulate -- --verbose"

# Test 8: Zero spend (deposit and fund only)
run_test "Zero spend amount" \
  "npm run simulate -- --spend-amount 1 --deposit-amount 10000 --funding-amount 5000 --withdrawal-amount 5000"

# Test 9: Maximum withdrawal (withdraw all available)
run_test "Maximum withdrawal scenario" \
  "npm run simulate -- --deposit-amount 20000 --spend-amount 5000 --funding-amount 10000 --withdrawal-amount 25000"

# Test 10: Equal amounts (balanced scenario)
run_test "Equal transaction amounts" \
  "npm run simulate -- --deposit-amount 10000 --spend-amount 10000 --funding-amount 10000 --withdrawal-amount 10000"

# Test 11: Consecutive runs (stability test)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TEST: Consecutive runs (stability)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONSECUTIVE_PASS=0
for i in {1..5}; do
  if npm run simulate > /dev/null 2>&1; then
    ((CONSECUTIVE_PASS++))
  fi
done

if [ "$CONSECUTIVE_PASS" -eq 5 ]; then
  echo "✅ PASS: Consecutive runs (5/5)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: Consecutive runs ($CONSECUTIVE_PASS/5)"
  ((FAIL_COUNT++))
fi

# Test 12: Export with verbose
run_test "Export + Verbose combined" \
  "npm run simulate -- --export '$RESULTS_DIR/verbose-export.json' --verbose"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 TEST RESULTS SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Passed: $PASS_COUNT"
echo "❌ Failed: $FAIL_COUNT"
echo "📁 Results exported to: $RESULTS_DIR/"

TOTAL=$((PASS_COUNT + FAIL_COUNT))
SUCCESS_RATE=$((PASS_COUNT * 100 / TOTAL))

echo ""
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "🎉 ALL TESTS PASSED! Success Rate: 100%"
  exit 0
else
  echo "⚠️  Some tests failed. Success Rate: ${SUCCESS_RATE}%"
  exit 1
fi


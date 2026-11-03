#!/usr/bin/env bash
set -euo pipefail

echo "Running Python test suite..."
if ! python3 run_tests.py; then
  echo "FAIL: python3 run_tests.py"
  exit 1
fi

echo "Running Python LLM mock suite..."
if ! python3 run_tests.py --llm tests/mock_llm_output.json; then
  echo "FAIL: python3 run_tests.py --llm tests/mock_llm_output.json"
  exit 1
fi

echo "Running LLM grounding negative fixture (must FAIL)..."
if python3 run_tests.py --llm tests/mock_llm_output_negative.json >/dev/null 2>&1; then
  echo "FAIL: negative LLM grounding fixture unexpectedly PASSED — the grounding gate is broken"
  exit 1
fi

echo "Running Node module tests..."
if ! node tests/js/run-tests.js; then
  echo "FAIL: node tests/js/run-tests.js"
  exit 1
fi

echo "PREFLIGHT PASSED"

<#
.SYNOPSIS
    Windows-native port of scripts/preflight.sh - the pre-deploy gate.

.DESCRIPTION
    Runs the same suites, in the same order, with the same fail-fast behaviour
    and the same exit codes as scripts/preflight.sh:

        1. python3 run_tests.py                            Bank Variant validation
        2. python3 run_tests.py --llm <mock>               + LLM grounding rules
        3. node tests/js/run-tests.js                      JS contracts + corpus gate

    SOURCE OF TRUTH: scripts/preflight.sh. This file is a mirror so the gate can
    run on Windows, where bash is unavailable. If a suite is added to or removed
    from preflight.sh, change it here too - otherwise the two platforms diverge
    silently and "the gate passed" stops meaning the same thing on each.

    Deliberate deviation, Windows only: a precondition check runs first, because
    the python3 name can resolve to a Microsoft Store stub that exits non-zero
    without executing anything. Catching that here names the real problem
    instead of reporting a misleading suite failure. preflight.sh has no
    equivalent - python3 and node are assumed present on the target host.

.EXAMPLE
    powershell -File ./scripts/preflight.ps1

.NOTES
    Exit codes:
        0  every suite passed
        1  a suite failed
        2  python3 or node is missing or non-functional (Windows-only condition)
#>

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
    # --- Windows-only precondition check ---------------------------------
    # Invoke the interpreter rather than merely locating it: the Store stub is
    # a real executable on PATH, so Get-Command would report it as present.
    foreach ($tool in @('python3', 'node')) {
        if (-not (Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue)) {
            Write-Host "FAIL: '$tool' is not on PATH"
            exit 2
        }
        & $tool --version *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "FAIL: '$tool' is present but not functional (exits $LASTEXITCODE)"
            exit 2
        }
    }

    Write-Host 'Running Python test suite...'
    & python3 run_tests.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'FAIL: python3 run_tests.py'
        exit 1
    }

    Write-Host 'Running Python LLM mock suite...'
    & python3 run_tests.py --llm tests/mock_llm_output.json
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'FAIL: python3 run_tests.py --llm tests/mock_llm_output.json'
        exit 1
    }

    Write-Host 'Running LLM grounding negative fixture (must FAIL)...'
    & python3 run_tests.py --llm tests/mock_llm_output_negative.json *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'FAIL: negative LLM grounding fixture unexpectedly PASSED - the grounding gate is broken'
        exit 1
    }

    Write-Host 'Running Node module tests...'
    & node tests/js/run-tests.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'FAIL: node tests/js/run-tests.js'
        exit 1
    }

    Write-Host 'PREFLIGHT PASSED'
    exit 0
}
finally {
    Pop-Location
}

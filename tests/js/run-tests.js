#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');

var testDir = __dirname;
var passed = 0;
var failed = 0;
var finished = false;

// Discover test files
var files = fs.readdirSync(testDir).filter(function(f) {
  return f.startsWith('test-') && f.endsWith('.js');
}).sort();

if (files.length === 0) {
  console.log('No test files found in ' + testDir);
  process.exit(1);
}

// Sequential, one suite at a time: every suite fakes its own page on the
// shared globalThis — document, window, fetch, and the global App
// singleton's mutable state (active bank, quiz Session, results report) —
// and restores what it snapshotted when it finishes. Firing the async
// suites without waiting let one suite's page bleed into another's
// assertions (and the old `var pending` initialiser, which ran after the
// loop and reset the counter, silently dropped the trailing async suites
// from the summary entirely).
(async function runAll() {
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var mod = require(path.join(testDir, file));
    console.log('\n=== ' + (mod.name || file) + ' ===');

    var results = mod.run();
    if (results && typeof results.then === 'function') {
      results = await results;
    }
    report(results || []);
  }
  finish();
})();

function report(rs) {
  rs.forEach(function(r) {
    if (r.pass) {
      passed++;
      console.log('  [PASS] ' + r.message);
    } else {
      failed++;
      console.log('  [FAIL] ' + r.message);
    }
  });
}

function finish() {
  if (finished) return;
  finished = true;
  console.log('\n--- Summary ---');
  console.log(passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
  process.exit(failed > 0 ? 1 : 0);
}
process.on('beforeExit', finish);

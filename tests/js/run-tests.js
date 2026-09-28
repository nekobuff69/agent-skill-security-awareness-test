#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');

var testDir = __dirname;
var passed = 0;
var failed = 0;

// Discover test files
var files = fs.readdirSync(testDir).filter(function(f) {
  return f.startsWith('test-') && f.endsWith('.js');
}).sort();

if (files.length === 0) {
  console.log('No test files found in ' + testDir);
  process.exit(1);
}

files.forEach(function(file) {
  var mod = require(path.join(testDir, file));
  console.log('\n=== ' + (mod.name || file) + ' ===');

  var results = mod.run();
  if (results && typeof results.then === 'function') {
    // Async module: defer accounting until the promise resolves
    pending++;
    results.then(function(rs) {
      report(rs);
      pending--;
      finish();
    });
  } else {
    report(results || []);
  }
});

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

var pending = 0;
var finished = false;
function finish() {
  if (finished || pending > 0) return;
  finished = true;
  console.log('\n--- Summary ---');
  console.log(passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
  process.exit(failed > 0 ? 1 : 0);
}
process.on('beforeExit', finish);

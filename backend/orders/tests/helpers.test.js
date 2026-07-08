// Unit tests for pure GAS-free helpers in schema.js and auth.js.
// Run with: node --test backend/orders/tests/helpers.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Load one or more source files into a shared VM context that has minimal GAS
// stubs. Functions defined in the files become properties of the returned ctx.
function loadInContext() {
  const ctx = vm.createContext({
    // GAS stubs — enough to load without errors; tests only call GAS-free fns.
    SpreadsheetApp: {}, PropertiesService: {}, Utilities: {},
    DriveApp: {}, LockService: {}, ContentService: {}, Logger: { log: () => {} },
    Session: {}, ScriptApp: {},
    Date: Date, JSON: JSON,
    String: String, Number: Number, Math: Math, Array: Array, Object: Object
  });
  const dir = path.join(__dirname, '..');
  for (const f of arguments) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
  }
  return ctx;
}

// ── buildColMap_ ─────────────────────────────────────────────────────────────

test('buildColMap_ maps headers to 0-based indices', () => {
  const ctx = loadInContext('schema.js');
  const headers = ['Bill No', 'Date', 'Customer Name'];
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers] }),
    getName: () => 'Orders'
  };
  const cm = ctx.buildColMap_(sheet, { billNo: 'Bill No', date: 'Date', name: 'Customer Name' });
  assert.equal(cm.billNo, 0);
  assert.equal(cm.date, 1);
  assert.equal(cm.name, 2);
});

test('buildColMap_ handles out-of-order headers', () => {
  const ctx = loadInContext('schema.js');
  const headers = ['Date', 'Bill No'];
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers] }),
    getName: () => 'Orders'
  };
  const cm = ctx.buildColMap_(sheet, { billNo: 'Bill No', date: 'Date' });
  assert.equal(cm.date, 0);
  assert.equal(cm.billNo, 1);
});

test('buildColMap_ trims whitespace from header strings', () => {
  const ctx = loadInContext('schema.js');
  const headers = [' Bill No ', '  Date  '];
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers] }),
    getName: () => 'Orders'
  };
  const cm = ctx.buildColMap_(sheet, { billNo: 'Bill No', date: 'Date' });
  assert.equal(cm.billNo, 0);
  assert.equal(cm.date, 1);
});

test('buildColMap_ throws on missing column', () => {
  const ctx = loadInContext('schema.js');
  const headers = ['Bill No'];
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers] }),
    getName: () => 'Orders'
  };
  assert.throws(
    () => ctx.buildColMap_(sheet, { billNo: 'Bill No', date: 'Date' }),
    /Column "Date" not found in "Orders"/
  );
});

test('buildColMap_ works with full ORDER_COLS on a correctly-headed sheet', () => {
  const ctx = loadInContext('schema.js');
  const headers = ctx.ORDER_HEADERS;
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers] }),
    getName: () => 'Orders'
  };
  const cm = ctx.buildColMap_(sheet, ctx.ORDER_COLS);
  // Every key in ORDER_COLS should map to the correct index in ORDER_HEADERS.
  for (const key of Object.keys(ctx.ORDER_COLS)) {
    const expectedIdx = headers.indexOf(ctx.ORDER_COLS[key]);
    assert.equal(cm[key], expectedIdx, `key ${key} should map to index ${expectedIdx}`);
  }
});

// ── buildRow_ ────────────────────────────────────────────────────────────────

test('buildRow_ produces an array the length of ORDER_HEADERS', () => {
  const ctx = loadInContext('schema.js');
  const row = ctx.buildRow_({});
  assert.equal(row.length, ctx.ORDER_HEADERS.length);
});

test('buildRow_ fills missing columns with empty string', () => {
  const ctx = loadInContext('schema.js');
  assert.ok(ctx.buildRow_({}).every(v => v === ''));
});

test('buildRow_ places values at the correct positions', () => {
  const ctx = loadInContext('schema.js');
  const row = ctx.buildRow_({ 'Bill No': 'CCK-001', 'Total Amount': 500 });
  assert.equal(row[ctx.ORDER_HEADERS.indexOf('Bill No')], 'CCK-001');
  assert.equal(row[ctx.ORDER_HEADERS.indexOf('Total Amount')], 500);
  assert.equal(row[ctx.ORDER_HEADERS.indexOf('Customer Name')], '');
});

test('buildRow_ ignores keys not in ORDER_HEADERS', () => {
  const ctx = loadInContext('schema.js');
  const row = ctx.buildRow_({ 'Bill No': 'CCK-002', 'NotAColumn': 'ignored' });
  assert.equal(row[0], 'CCK-002');
  assert.ok(!row.includes('ignored'));
});

// ── colLetter_ ───────────────────────────────────────────────────────────────

test('colLetter_ converts single-letter columns correctly', () => {
  const ctx = loadInContext('schema.js');
  assert.equal(ctx.colLetter_(0),  'A');
  assert.equal(ctx.colLetter_(1),  'B');
  assert.equal(ctx.colLetter_(25), 'Z');
});

test('colLetter_ converts double-letter columns correctly', () => {
  const ctx = loadInContext('schema.js');
  assert.equal(ctx.colLetter_(26), 'AA');
  assert.equal(ctx.colLetter_(27), 'AB');
  assert.equal(ctx.colLetter_(51), 'AZ');
  assert.equal(ctx.colLetter_(52), 'BA');
});

// ── rowToOrder_ ──────────────────────────────────────────────────────────────

test('rowToOrder_ maps row array to order object using the column map', () => {
  const ctx = loadInContext('schema.js');
  const headers = ctx.ORDER_HEADERS;
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers] }),
    getName: () => 'Orders'
  };
  const cm = ctx.buildColMap_(sheet, ctx.ORDER_COLS);

  const row = new Array(headers.length).fill('');
  row[cm.billNo] = 'CCK-001';
  row[cm.name]   = 'Test Customer';
  row[cm.totalAmount] = 750;

  const order = ctx.rowToOrder_(row, cm);
  assert.equal(order.billNo, 'CCK-001');
  assert.equal(order.name, 'Test Customer');
  assert.equal(order.totalAmount, 750);
  assert.equal(order.email, '');
});

// ── constantEquals_ ──────────────────────────────────────────────────────────

test('constantEquals_ returns true for equal strings', () => {
  const ctx = loadInContext('schema.js', 'auth.js');
  assert.equal(ctx.constantEquals_('abc', 'abc'), true);
  assert.equal(ctx.constantEquals_('', ''), true);
});

test('constantEquals_ returns false for different strings of the same length', () => {
  const ctx = loadInContext('schema.js', 'auth.js');
  assert.equal(ctx.constantEquals_('abc', 'abd'), false);
});

test('constantEquals_ returns false for different-length strings', () => {
  const ctx = loadInContext('schema.js', 'auth.js');
  assert.equal(ctx.constantEquals_('abc', 'ab'), false);
  assert.equal(ctx.constantEquals_('', 'a'), false);
});

// Customer management — upsertCustomer is always called inside a locked
// context (from doPost), so it does not acquire its own lock.

function getCustomers() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cs = ss.getSheetByName('Customers');
    if (!cs || cs.getLastRow() <= 1) return jsonResponse({ status: 'success', customers: [] });
    var cm = buildColMap_(cs, CUSTOMER_COLS);
    var rows = cs.getRange(2, 1, cs.getLastRow() - 1, cs.getLastColumn()).getValues();
    var customers = rows.filter(function(r) { return String(r[cm.name]).trim(); }).map(function(r) {
      return {
        name:          r[cm.name],
        phone:         r[cm.phone],
        address:       r[cm.address],
        email:         r[cm.email],
        notes:         r[cm.notes],
        lastOrderDate: r[cm.lastOrderDate],
        totalOrders:   r[cm.totalOrders]
      };
    });
    return jsonResponse({ status: 'success', customers: customers });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// Creates or updates a customer record matched by name (case-insensitive).
// Updates phone/email/address with the latest values and increments order count.
// Callers are responsible for holding a script lock when concurrent writes are possible.
function upsertCustomer(name, phone, email, address, orderDate) {
  if (!String(name).trim()) return;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cs = ss.getSheetByName('Customers');
    if (!cs) {
      cs = ss.insertSheet('Customers');
      cs.appendRow(CUSTOMER_HEADERS);
    }
    var cm = buildColMap_(cs, CUSTOMER_COLS);
    var nameLower = String(name).trim().toLowerCase();
    var lastRow = cs.getLastRow();
    if (lastRow > 1) {
      var names = cs.getRange(2, cm.name + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < names.length; i++) {
        if (String(names[i][0]).trim().toLowerCase() === nameLower) {
          var row = i + 2;
          if (phone)   cs.getRange(row, cm.phone + 1).setValue(phone);
          if (address) cs.getRange(row, cm.address + 1).setValue(address);
          if (email)   cs.getRange(row, cm.email + 1).setValue(email);
          cs.getRange(row, cm.lastOrderDate + 1).setValue(orderDate || '');
          var prev = cs.getRange(row, cm.totalOrders + 1).getValue() || 0;
          cs.getRange(row, cm.totalOrders + 1).setValue(Number(prev) + 1);
          return;
        }
      }
    }
    cs.appendRow([String(name).trim(), phone || '', address || '', email || '', '', orderDate || '', 1]);
  } catch (err) {
    Logger.log('upsertCustomer error: ' + err.toString());
  }
}

// ONE-TIME MIGRATION — run once from the Apps Script editor.
// Clears and rebuilds the Customers sheet from all rows in the Orders sheet.
// Safe to re-run — it always rebuilds from scratch.
function migrateCustomersFromOrders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cs = ss.getSheetByName('Customers');
  if (!cs) {
    cs = ss.insertSheet('Customers');
  } else {
    cs.clearContents();
  }
  cs.appendRow(CUSTOMER_HEADERS);

  var os = ss.getActiveSheet();
  var lastRow = os.getLastRow();
  if (lastRow <= 1) { Logger.log('No orders to migrate.'); return; }

  var cm = buildColMap_(os, ORDER_COLS);
  var data = os.getRange(2, 1, lastRow - 1, os.getLastColumn()).getValues();
  var map = {};
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var rawName = String(r[cm.name]).trim();
    if (!rawName) continue;
    var key = rawName.toLowerCase();
    var dateVal = r[cm.date] ? new Date(r[cm.date]) : null;
    if (!map[key]) {
      map[key] = {
        name: rawName,
        phone: String(r[cm.phone]).trim(),
        address: String(r[cm.address]).trim(),
        email: String(r[cm.email]).trim(),
        lastDate: dateVal,
        count: 1
      };
    } else {
      map[key].count++;
      if (dateVal && (!map[key].lastDate || dateVal > map[key].lastDate)) {
        map[key].lastDate = dateVal;
        if (r[cm.phone])   map[key].phone   = String(r[cm.phone]).trim();
        if (r[cm.address]) map[key].address = String(r[cm.address]).trim();
        if (r[cm.email])   map[key].email   = String(r[cm.email]).trim();
      }
    }
  }

  var rows = [];
  for (var k in map) {
    var c = map[k];
    var dateStr = c.lastDate ? Utilities.formatDate(c.lastDate, Session.getScriptTimeZone(), 'dd/MM/yyyy') : '';
    rows.push([c.name, c.phone, c.address, c.email, '', dateStr, c.count]);
  }
  rows.sort(function(a, b) { return b[6] - a[6]; });
  if (rows.length > 0) cs.getRange(2, 1, rows.length, CUSTOMER_HEADERS.length).setValues(rows);
  Logger.log('Migrated ' + rows.length + ' unique customers.');
}

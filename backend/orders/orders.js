// Orders CRUD — reads are unlocked; writes use a script-level lock.

function getOrders(search, limit) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return jsonResponse({ status: 'success', orders: [] });

    var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var s = search.toLowerCase();
    var filtered = s ? data.filter(function(r) {
      return String(r[cm.billNo]).toLowerCase().indexOf(s) > -1 ||
             String(r[cm.name]).toLowerCase().indexOf(s) > -1;
    }) : data;

    var orders = filtered.slice().reverse().slice(0, limit).map(function(r) {
      return rowToOrder_(r, cm);
    });
    return jsonResponse({ status: 'success', orders: orders });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function updateStatus(billNo, status) {
  var valid = ['Pending', 'Paid', 'Refunded', 'Failed', 'Cancelled'];
  if (!billNo || valid.indexOf(status) === -1) {
    return jsonResponse({ status: 'error', message: 'Invalid bill number or status' });
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return jsonResponse({ status: 'error', message: 'Bill not found' });

    var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
    var billNos = sheet.getRange(2, cm.billNo + 1, lastRow - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < billNos.length; i++) {
      if (String(billNos[i][0]) === String(billNo)) { rowIndex = i + 2; break; }
    }
    if (rowIndex === -1) return jsonResponse({ status: 'error', message: 'Bill not found' });

    sheet.getRange(rowIndex, cm.paymentStatus + 1).setValue(status);
    return jsonResponse({ status: 'success' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function uploadPaymentProof(data) {
  var billNo = data.billNo || '';
  var imageBase64 = data.imageBase64 || '';
  var mimeType = data.mimeType || 'image/jpeg';
  if (!billNo || !imageBase64) {
    return jsonResponse({ status: 'error', message: 'Missing billNo or image data' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var folderName = 'CCK Payment Screenshots';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var ext = mimeType.split('/')[1] || 'jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(imageBase64), mimeType, billNo + '-proof.' + ext);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var link = file.getUrl();

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
      var billNos = sheet.getRange(2, cm.billNo + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < billNos.length; i++) {
        if (String(billNos[i][0]) === String(billNo)) {
          sheet.getRange(i + 2, cm.paymentProof + 1).setValue(link);
          break;
        }
      }
    }
    return jsonResponse({ status: 'success', link: link });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function getOrderByBill(billNo, token) {
  if (!billNo || !token) {
    return jsonResponse({ status: 'error', message: 'Invalid link' });
  }
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return jsonResponse({ status: 'error', message: 'Order not found' });

    var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      if (String(r[cm.billNo]) === String(billNo)) {
        if (String(r[cm.shareToken]) !== String(token)) {
          return jsonResponse({ status: 'error', message: 'Invalid link' });
        }
        return jsonResponse({
          status: 'success',
          order: {
            billNo:            r[cm.billNo],
            date:              r[cm.date],
            name:              r[cm.name],
            itemsSummary:      r[cm.itemsSummary],
            totalItems:        r[cm.totalItems],
            deliveryCharges:   r[cm.deliveryCharges],
            totalAmount:       r[cm.totalAmount],
            paymentStatus:     r[cm.paymentStatus],
            dispatchDate:      r[cm.dispatchDate],
            fulfillmentStatus: r[cm.fulfillmentStatus],
            trackingLink:      r[cm.trackingLink]
          }
        });
      }
    }
    return jsonResponse({ status: 'error', message: 'Order not found' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function updateOrder(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return jsonResponse({ status: 'error', message: 'Order not found' });

    var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
    var billNos = sheet.getRange(2, cm.billNo + 1, lastRow - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < billNos.length; i++) {
      if (String(billNos[i][0]).trim() === String(data.billNo).trim()) {
        rowIndex = i + 2;
        break;
      }
    }
    if (rowIndex === -1) return jsonResponse({ status: 'error', message: 'Order not found: ' + data.billNo });

    var fields = {};
    fields[cm.name]            = data.name || '';
    fields[cm.phone]           = data.phone || '';
    fields[cm.email]           = data.email || '';
    fields[cm.address]         = data.address || '';
    fields[cm.itemsSummary]    = data.itemsSummary || '';
    fields[cm.totalItems]      = Number(data.totalItems) || 0;
    fields[cm.deliveryCharges] = Number(data.deliveryCharges) || 0;
    fields[cm.totalAmount]     = Number(data.totalAmount) || 0;
    fields[cm.dispatchDate]    = data.dispatchDate || '';
    fields[cm.remarks]         = data.remarks || '';
    fields[cm.mapLink]         = data.mapLink || '';
    fields[cm.deliveryType]    = data.deliveryType || '';
    if (cm.discount != null) fields[cm.discount] = Number(data.discount) || 0;

    for (var col in fields) {
      sheet.getRange(rowIndex, Number(col) + 1).setValue(fields[col]);
    }

    upsertCustomer(data.name || '', data.phone || '', data.email || '', data.address || '', '');
    return jsonResponse({ status: 'success', billNo: data.billNo });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function getCatalog() {
  try {
    var json = PropertiesService.getScriptProperties().getProperty('CATALOG');
    return jsonResponse({ status: 'success', catalog: json ? JSON.parse(json) : null });
  } catch(e) {
    return jsonResponse({ status: 'error', message: e.toString() });
  }
}

function saveCatalog(data) {
  try {
    var props = PropertiesService.getScriptProperties();
    if (data.catalog === null || data.catalog === undefined) {
      props.deleteProperty('CATALOG');
    } else {
      if (!Array.isArray(data.catalog)) return jsonResponse({ status: 'error', message: 'Invalid catalog format' });
      props.setProperty('CATALOG', JSON.stringify(data.catalog));
    }
    return jsonResponse({ status: 'success' });
  } catch(e) {
    return jsonResponse({ status: 'error', message: e.toString() });
  }
}

function updateFulfillment(billNo, fulfillmentStatus, trackingLink, dtdcAwb) {
  var valid = ['Packed', 'Booked', 'Picked Up', 'Delivered'];
  if (!billNo || valid.indexOf(fulfillmentStatus) === -1) {
    return jsonResponse({ status: 'error', message: 'Invalid bill number or fulfillment status' });
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return jsonResponse({ status: 'error', message: 'Bill not found' });

    var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
    var billNos = sheet.getRange(2, cm.billNo + 1, lastRow - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < billNos.length; i++) {
      if (String(billNos[i][0]) === String(billNo)) { rowIndex = i + 2; break; }
    }
    if (rowIndex === -1) return jsonResponse({ status: 'error', message: 'Bill not found' });

    sheet.getRange(rowIndex, cm.fulfillmentStatus + 1).setValue(fulfillmentStatus);
    if (trackingLink) sheet.getRange(rowIndex, cm.trackingLink + 1).setValue(trackingLink);
    if (dtdcAwb && cm.dtdcAwb != null) sheet.getRange(rowIndex, cm.dtdcAwb + 1).setValue(dtdcAwb);
    return jsonResponse({ status: 'success' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Extracts the AWB number from a DTDC tracking URL query string.
function extractDtdcAwbFromUrl_(url) {
  try {
    var qs = (url.split('?')[1] || '').split('#')[0];
    var pairs = qs.split('&');
    var map = {};
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      map[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    }
    return map['cnNo'] || map['awbno'] || map['awb'] || '';
  } catch (e) {
    return '';
  }
}

// Fetches live DTDC tracking status for a given AWB.
// Returns 'Picked Up', 'Delivered', or null (no change / unreachable).
function fetchDtdcStatus_(awb) {
  try {
    var url = 'https://tracking.dtdc.com/ctbs-tracking/customerInterface.tr' +
              '?submitFlag=showTrackingResults&cType=Consignment&cnNo=' + encodeURIComponent(awb);
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CCK-Tracker/1.0)' },
      followRedirects: true
    });
    if (resp.getResponseCode() !== 200) return null;
    var body = resp.getContentText().toLowerCase();
    if (body.indexOf('delivered') > -1) return 'Delivered';
    if (body.indexOf('out for delivery') > -1 ||
        body.indexOf('shipment out for delivery') > -1) return 'Picked Up';
    if (body.indexOf('picked up') > -1 ||
        body.indexOf('shipment collected') > -1 ||
        body.indexOf('collected from sender') > -1) return 'Picked Up';
    return null;
  } catch (e) {
    Logger.log('fetchDtdcStatus_ error for AWB ' + awb + ': ' + e.toString());
    return null;
  }
}

// Time-driven trigger: auto-advance fulfillment for DTDC orders.
// Set up via setupDtdcTrigger() in setup.js; runs hourly.
// NOTE: must NOT end with _ so it appears in the Apps Script trigger UI.
function pollDtdcTracking() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var cm = buildColMap_(sheet, ORDER_COLS, ORDER_OPTIONAL_COLS);
    if (cm.dtdcAwb == null) return;

    var progression = ['Packed', 'Booked', 'Picked Up', 'Delivered'];
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      var fulfillment = String(r[cm.fulfillmentStatus] || '');
      if (fulfillment === 'Delivered') continue;

      var trackingLink = String(r[cm.trackingLink] || '');
      if (trackingLink.toLowerCase().indexOf('dtdc') === -1) continue;

      var awb = String(r[cm.dtdcAwb] || '').trim();
      if (!awb) {
        awb = extractDtdcAwbFromUrl_(trackingLink);
        if (awb) sheet.getRange(i + 2, cm.dtdcAwb + 1).setValue(awb);
      }
      if (!awb) continue;

      var newStatus = fetchDtdcStatus_(awb);
      if (!newStatus) continue;

      var curIdx = progression.indexOf(fulfillment);
      var newIdx = progression.indexOf(newStatus);
      if (newIdx > curIdx) {
        sheet.getRange(i + 2, cm.fulfillmentStatus + 1).setValue(newStatus);
        Logger.log('pollDtdcTracking_: ' + r[cm.billNo] + ' ' + fulfillment + ' → ' + newStatus);
      }
    }
  } catch (err) {
    Logger.log('pollDtdcTracking_ error: ' + err.toString());
  }
}

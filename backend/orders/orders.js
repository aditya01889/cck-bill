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

function updateFulfillment(billNo, fulfillmentStatus, trackingLink) {
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
    return jsonResponse({ status: 'success' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ONE-TIME SHEET SETUP HELPERS — run from the Apps Script editor function dropdown.
// Both helpers derive the column letter from the live header row, so they work
// even if columns are reordered.

// Adds a dropdown to the Payment Status column (rows 2–1000).
function setupPaymentStatusDropdown() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cm = buildColMap_(sheet, ORDER_COLS);
  var col = colLetter_(cm.paymentStatus);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Paid', 'Refunded', 'Failed', 'Cancelled'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(col + '2:' + col + '1000').setDataValidation(rule);
  Logger.log('Payment Status dropdown applied to ' + col + '2:' + col + '1000');
}

// Adds the 'Discount' column header to the sheet if it doesn't already exist.
// Run once from the Apps Script editor after deploying the discount feature.
function setupDiscountColumn() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('Discount') !== -1) {
    Logger.log('Discount column already exists.');
    return;
  }
  var nextCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, nextCol).setValue('Discount');
  Logger.log('Discount column added at column ' + nextCol + ' (' + colLetter_(nextCol - 1) + ').');
}

// Adds the 'DTDC AWB' column header to the sheet if it doesn't already exist.
// Run once from the Apps Script editor after deploying this feature.
function setupDtdcAwbColumn() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('DTDC AWB') !== -1) {
    Logger.log('DTDC AWB column already exists.');
    return;
  }
  var nextCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, nextCol).setValue('DTDC AWB');
  Logger.log('DTDC AWB column added at column ' + nextCol + ' (' + colLetter_(nextCol - 1) + ').');
}

// Creates an hourly time-driven trigger for pollDtdcTracking_().
// Safe to run multiple times — deletes any existing trigger first.
function setupDtdcTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pollDtdcTracking') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('pollDtdcTracking')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('DTDC polling trigger created (hourly).');
}

// Adds a dropdown to the Fulfillment Status column (rows 2–1000).
function setupFulfillmentDropdown() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cm = buildColMap_(sheet, ORDER_COLS);
  var col = colLetter_(cm.fulfillmentStatus);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Packed', 'Booked', 'Picked Up', 'Delivered'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(col + '2:' + col + '1000').setDataValidation(rule);
  Logger.log('Fulfillment Status dropdown applied to ' + col + '2:' + col + '1000');
}

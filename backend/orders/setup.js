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

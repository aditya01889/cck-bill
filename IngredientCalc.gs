// IngredientCalc.gs — Apps Script for the CCK Ingredient Calculator sheet
// Deploy this as a Web App from the Ingredient Calculator Google Sheet
// (Sheet ID: 19KsODKUYk8_1eeSTlk20Kt92MIXjj17BPk_iDaAP8Oc)
// Execute as: Me | Access: Anyone

function doGet(e) {
  var action = (e && e.parameter) ? e.parameter.action : null;
  if (action === 'matrix') {
    // Requires a valid session token issued by the main app's login.
    if (!verifyToken_(e && e.parameter ? e.parameter.auth : null)) {
      return jsonResponse({ status: 'error', message: 'Unauthorized' });
    }
    return getIngredientMatrix();
  }
  return ContentService.createTextOutput('CCK Ingredient Calculator running.');
}

/* ============================================================
 * AUTH (verify only)
 * ------------------------------------------------------------
 * This web app only *verifies* session tokens minted by the main
 * app (AppsScript.gs). For that to work, this project's Script
 * Properties must contain a SERVER_SECRET with the SAME value as
 * the main project. Set it once via Project Settings ▸ Script
 * Properties (copy the value from the main project) — see
 * SECURITY_SETUP.md.
 * ============================================================ */
function getServerSecret_() {
  var s = PropertiesService.getScriptProperties().getProperty('SERVER_SECRET');
  if (!s) throw new Error('SERVER_SECRET is not set on the Ingredient Calculator project.');
  return s;
}

function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function b64urlDecodeStr_(s) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}

function hmac_(message) {
  return b64url_(Utilities.computeHmacSha256Signature(message, getServerSecret_()));
}

function constantEquals_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function verifyToken_(token) {
  if (!token) return null;
  var parts = String(token).split('.');
  if (parts.length !== 2) return null;
  try {
    if (!constantEquals_(parts[1], hmac_(parts[0]))) return null;
    var payload = JSON.parse(b64urlDecodeStr_(parts[0]));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;
    return payload; // { u, r, exp }
  } catch (err) {
    return null;
  }
}

function getIngredientMatrix() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Product_Ingredient_Matrix');
    if (!sheet) return jsonResponse({ status: 'error', message: 'Sheet not found: Product_Ingredient_Matrix' });

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 3) return jsonResponse({ status: 'success', matrix: {}, ingredients: [] });

    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

    // Sheet layout:
    //   Row 1 (data[0]): title row — "Current Order ID" etc, ignored
    //   Row 2 (data[1]): headers — A=Product Name, B=Product Weight, C=Item Ordered, D+=ingredient names
    //   Row 3+ (data[2]+): one product per row; stop at "Total" or blank col A
    //   Ingredient amounts in cols D onwards are per-unit grams (formulas like 60%*weight)

    var EXCLUDE = ['Banana', 'Beetroot'];
    var headerRow = data[1]; // row 2

    // Collect ingredient names from col D (index 3) onwards
    var allIngredients = [];
    for (var c = 3; c < headerRow.length; c++) {
      var ing = String(headerRow[c]).trim();
      if (ing) allIngredients.push(ing);
    }
    var ingredients = allIngredients.filter(function(n) { return EXCLUDE.indexOf(n) === -1; });

    var matrix = {};
    for (var r = 2; r < data.length; r++) {
      var row = data[r];
      var productName = String(row[0]).trim();
      // Stop at empty rows, "Total" section, or "Ingredients" section header
      if (!productName || productName.toLowerCase().indexOf('total') === 0 || productName === 'Ingredients') break;
      matrix[productName] = {};
      for (var c = 3; c < headerRow.length; c++) {
        var ingName = String(headerRow[c]).trim();
        if (!ingName || EXCLUDE.indexOf(ingName) > -1) continue;
        var val = row[c];
        if (typeof val === 'number' && val > 0) {
          matrix[productName][ingName] = val;
        }
      }
    }

    return jsonResponse({ status: 'success', matrix: matrix, ingredients: ingredients });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run this from the Apps Script editor to verify the sheet is being read correctly.
function logMatrixDebug() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Product_Ingredient_Matrix');
  if (!sheet) { Logger.log('SHEET NOT FOUND: Product_Ingredient_Matrix'); return; }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  Logger.log('Sheet found. Rows: ' + lastRow + ', Cols: ' + lastCol);
  var data = sheet.getRange(1, 1, Math.min(lastRow, 15), lastCol).getValues();
  Logger.log('Row 1: ' + JSON.stringify(data[0].slice(0, 6)));
  Logger.log('Row 2 (headers): ' + JSON.stringify(data[1].slice(0, 8)));
  Logger.log('Row 3 (first product): ' + JSON.stringify(data[2].slice(0, 8)));
  Logger.log('Row 4: ' + JSON.stringify(data[3].slice(0, 8)));
}

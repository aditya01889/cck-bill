// IngredientCalc.gs — Apps Script for the CCK Ingredient Calculator sheet
// Deploy this as a Web App from the Ingredient Calculator Google Sheet
// (Sheet ID: 19KsODKUYk8_1eeSTlk20Kt92MIXjj17BPk_iDaAP8Oc)
// Execute as: Me | Access: Anyone

function doGet(e) {
  var action = (e && e.parameter) ? e.parameter.action : null;
  if (action === 'matrix') return getIngredientMatrix();
  return ContentService.createTextOutput('CCK Ingredient Calculator running.');
}

function getIngredientMatrix() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Product_ingredient_matrix');
    if (!sheet) return jsonResponse({ status: 'error', message: 'Sheet not found: Product_ingredient_matrix' });

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return jsonResponse({ status: 'success', matrix: {}, ingredients: [] });

    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

    // Columns A=product name, B=category (skip), C onward = ingredient names
    // Row 1 = headers; rows 2+ = product rows
    // Ingredients to exclude from the result
    var EXCLUDE = ['Banana', 'Beetroot'];

    var allIngredients = [];
    for (var c = 2; c < data[0].length; c++) {
      var ing = String(data[0][c]).trim();
      if (ing) allIngredients.push(ing);
    }
    var ingredients = allIngredients.filter(function(n) { return EXCLUDE.indexOf(n) === -1; });

    var matrix = {};
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var productName = String(row[0]).trim();
      if (!productName) continue;
      matrix[productName] = {};
      for (var c = 2; c < data[0].length; c++) {
        var ingName = String(data[0][c]).trim();
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

// Client error log — errors reported by the web app land in the ErrorLog sheet.
// Capped at 500 entries; oldest rows are deleted automatically on each write.

function logClientError_(p) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    p = p || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('ErrorLog');
    if (!sh) {
      sh = ss.insertSheet('ErrorLog');
      sh.appendRow(['Timestamp', 'User', 'Message', 'Context', 'Path', 'UserAgent']);
    }
    // Trust a verified token for the username; fall back to client-supplied value.
    var payload = verifyToken_(p.auth);
    var user = payload ? payload.u : (p.user || '');
    sh.appendRow([
      new Date(),
      String(user).slice(0, 60),
      String(p.message || '').slice(0, 500),
      String(p.context || '').slice(0, 120),
      String(p.url || '').slice(0, 200),
      String(p.ua || '').slice(0, 300)
    ]);
    var extra = sh.getLastRow() - 501;
    if (extra > 0) sh.deleteRows(2, extra);
    return jsonResponse({ status: 'success' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

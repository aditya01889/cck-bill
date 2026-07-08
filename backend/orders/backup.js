// Automated backup — daily timestamped copy of the spreadsheet to Drive.
//
// ONE-TIME SETUP: run setupBackupTrigger() once from the Apps Script editor
// (grant Drive permission when prompted). It installs a daily trigger and
// takes an immediate first backup.

var BACKUP_FOLDER = 'CCK Backups';
var BACKUP_KEEP   = 30;

function backupSpreadsheet() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // backups can take a moment
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var file = DriveApp.getFileById(ss.getId());
    var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER);
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
    file.makeCopy('CCK backup ' + stamp, folder);
    pruneBackups_(folder, BACKUP_KEEP);
  } finally {
    lock.releaseLock();
  }
}

function pruneBackups_(folder, keep) {
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function(a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = keep; i < files.length; i++) files[i].setTrashed(true);
}

// ONE-TIME SETUP — installs a daily backup trigger (~2am) and takes the first
// backup immediately. Safe to re-run: removes any existing backup trigger first.
function setupBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'backupSpreadsheet') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('backupSpreadsheet').timeBased().everyDays(1).atHour(2).create();
  backupSpreadsheet();
  Logger.log('Daily backup trigger installed (runs ~2am) and a first backup was created.');
}

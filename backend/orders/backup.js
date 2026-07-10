// Write-triggered backup — copies the spreadsheet to Drive the first time a
// new order or bill edit is saved each day. Subsequent writes the same day are
// skipped (24-hour cooldown stored in Script Properties). Days with no writes
// produce no backup file.
//
// ONE-TIME MIGRATION: if you previously ran setupBackupTrigger() and have a
// daily time trigger installed, run removeBackupTrigger() once from the Apps
// Script editor to delete it. Then run setupWriteBackup() to take an
// immediate backup and reset the cooldown clock.

var BACKUP_FOLDER          = 'CCK Backups';
var BACKUP_KEEP            = 14;  // keep the 14 most recent backups
var BACKUP_COOLDOWN_MS     = 24 * 60 * 60 * 1000;

// Called after each successful write (new order, bill edit).
// No-ops if a backup was already taken within the last 24 hours.
function maybeBackupOnWrite_() {
  var props  = PropertiesService.getScriptProperties();
  var lastMs = parseInt(props.getProperty('LAST_BACKUP_MS') || '0');
  if (Date.now() - lastMs < BACKUP_COOLDOWN_MS) return;
  props.setProperty('LAST_BACKUP_MS', String(Date.now()));
  backupSpreadsheet_();
}

function backupSpreadsheet_() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var file    = DriveApp.getFileById(ss.getId());
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER);
  var stamp   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
  file.makeCopy('CCK backup ' + stamp, folder);
  pruneBackups_(folder, BACKUP_KEEP);
}

function pruneBackups_(folder, keep) {
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function(a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = keep; i < files.length; i++) files[i].setTrashed(true);
}

// Run ONCE from the Apps Script editor after deploying this change.
// Removes the old daily trigger, takes an immediate backup, and resets the
// cooldown so the next write will back up normally.
function setupWriteBackup() {
  removeBackupTrigger();
  PropertiesService.getScriptProperties().setProperty('LAST_BACKUP_MS', '0');
  maybeBackupOnWrite_();
  Logger.log('Write-triggered backup active. Old daily trigger removed. Immediate backup taken.');
}

// Removes any installed daily backup triggers (safe to run multiple times).
function removeBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'backupSpreadsheet') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('Removed ' + removed + ' daily backup trigger(s).');
}

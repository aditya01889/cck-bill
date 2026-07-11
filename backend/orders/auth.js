// Auth: stateless HMAC-SHA256-signed session tokens + user management.
//
// ONE-TIME SETUP (run from the Apps Script editor, once):
//   1. setupServerSecret()   — generates and stores the signing key
//   2. setupUser('Aditya',   'password', 'admin')
//      setupUser('Priyanka', 'password', 'staff')
// Re-run setupUser any time to reset a password.
// To disable a user, set their "active" cell in the Users sheet to FALSE.

var TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getServerSecret_() {
  var s = PropertiesService.getScriptProperties().getProperty('SERVER_SECRET');
  if (!s) throw new Error('SERVER_SECRET is not set — run setupServerSecret() once.');
  return s;
}

function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function b64urlEncodeStr_(str) {
  return b64url_(Utilities.newBlob(str).getBytes());
}

function b64urlDecodeStr_(s) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}

function hmac_(message) {
  return b64url_(Utilities.computeHmacSha256Signature(message, getServerSecret_()));
}

// Length-safe comparison that avoids per-character timing leaks.
function constantEquals_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function issueToken_(username, role) {
  var payload = b64urlEncodeStr_(JSON.stringify({ u: username, r: role, exp: Date.now() + TOKEN_TTL_MS }));
  return payload + '.' + hmac_(payload);
}

// Returns the decoded payload { u, r, exp } or null if the token is invalid/expired.
function verifyToken_(token) {
  if (!token) return null;
  var parts = String(token).split('.');
  if (parts.length !== 2) return null;
  if (!constantEquals_(parts[1], hmac_(parts[0]))) return null;
  var payload;
  try { payload = JSON.parse(b64urlDecodeStr_(parts[0])); } catch (err) { return null; }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function usersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Users');
  if (!sh) {
    sh = ss.insertSheet('Users');
    sh.appendRow(['username', 'salt', 'passwordHash', 'role', 'active']);
  }
  return sh;
}

function hashPassword_(password, salt) {
  return b64url_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt), Utilities.Charset.UTF_8));
}

function findUser_(username) {
  var sh = usersSheet_();
  var last = sh.getLastRow();
  if (last <= 1) return null;
  var rows = sh.getRange(2, 1, last - 1, 5).getValues();
  var uname = String(username).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === uname) {
      return { username: rows[i][0], salt: rows[i][1], hash: rows[i][2], role: rows[i][3], active: rows[i][4] };
    }
  }
  return null;
}

function login_(username, password) {
  var u = findUser_(username);
  var active = u && !(u.active === false || String(u.active).toLowerCase() === 'false');
  // Verify the password even for unknown users so response timing doesn't reveal
  // whether the username exists.
  var salt = u ? u.salt : 'no-such-user';
  var storedHash = u ? String(u.hash) : '';
  var ok = active && constantEquals_(hashPassword_(password, salt), storedHash);
  if (!ok) {
    return jsonResponse({ status: 'error', message: 'Invalid username or password' });
  }
  return jsonResponse({ status: 'success', token: issueToken_(u.username, u.role), user: u.username, role: u.role });
}

// ONE-TIME SETUP — generates the token-signing secret.
// Safe to re-run: only creates a secret if one doesn't already exist.
function setupServerSecret() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SERVER_SECRET')) {
    props.setProperty('SERVER_SECRET', Utilities.getUuid() + Utilities.getUuid());
    Logger.log('SERVER_SECRET generated.');
  } else {
    Logger.log('SERVER_SECRET already set — left unchanged.');
  }
}

// Create or reset a user. Run from the editor:
//   setupUser('Aditya', 'their-password', 'admin')
function setupUser(username, password, role) {
  if (!username || !password) throw new Error('username and password are required');
  var sh = usersSheet_();
  var salt = Utilities.getUuid();
  var hash = hashPassword_(password, salt);
  var row = [username, salt, hash, role || 'staff', true];
  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  var uname = String(username).trim().toLowerCase();
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i][0]).trim().toLowerCase() === uname) {
      sh.getRange(i + 2, 1, 1, 5).setValues([row]);
      Logger.log('Updated user ' + username);
      return;
    }
  }
  sh.appendRow(row);
  Logger.log('Created user ' + username);
}

// --- User management API helpers (called from main.js doPost/doGet) ---

function getUsersList_() {
  var sh = usersSheet_();
  var last = sh.getLastRow();
  if (last <= 1) return [];
  var rows = sh.getRange(2, 1, last - 1, 5).getValues();
  return rows.map(function(r) {
    return {
      username: String(r[0]),
      role: String(r[3]),
      active: !(r[4] === false || String(r[4]).toLowerCase() === 'false')
    };
  }).filter(function(u) { return u.username; });
}

function changePassword_(username, currentPassword, newPassword) {
  if (!newPassword || String(newPassword).length < 6) {
    return jsonResponse({ status: 'error', message: 'New password must be at least 6 characters.' });
  }
  var u = findUser_(username);
  if (!u) return jsonResponse({ status: 'error', message: 'User not found.' });
  if (!constantEquals_(hashPassword_(currentPassword, u.salt), String(u.hash))) {
    return jsonResponse({ status: 'error', message: 'Current password is incorrect.' });
  }
  setupUser(u.username, newPassword, u.role);
  return jsonResponse({ status: 'success' });
}

function addUserApi_(username, password, role) {
  var uname = String(username || '').trim();
  if (!uname || !password) {
    return jsonResponse({ status: 'error', message: 'Username and password are required.' });
  }
  if (String(password).length < 6) {
    return jsonResponse({ status: 'error', message: 'Password must be at least 6 characters.' });
  }
  if (findUser_(uname)) {
    return jsonResponse({ status: 'error', message: 'A user with that name already exists.' });
  }
  setupUser(uname, password, role || 'staff');
  return jsonResponse({ status: 'success' });
}

function updateUserApi_(targetUsername, role, active) {
  var sh = usersSheet_();
  var last = sh.getLastRow();
  if (last <= 1) return jsonResponse({ status: 'error', message: 'User not found.' });
  var rows = sh.getRange(2, 1, last - 1, 5).getValues();
  var uname = String(targetUsername || '').trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === uname) {
      var newRole   = role   !== undefined ? role   : rows[i][3];
      var newActive = active !== undefined ? active : rows[i][4];
      sh.getRange(i + 2, 4, 1, 2).setValues([[newRole, newActive]]);
      return jsonResponse({ status: 'success' });
    }
  }
  return jsonResponse({ status: 'error', message: 'User not found.' });
}

function resetPasswordApi_(targetUsername, newPassword) {
  if (!newPassword || String(newPassword).length < 6) {
    return jsonResponse({ status: 'error', message: 'Password must be at least 6 characters.' });
  }
  var u = findUser_(targetUsername);
  if (!u) return jsonResponse({ status: 'error', message: 'User not found.' });
  setupUser(u.username, newPassword, u.role);
  return jsonResponse({ status: 'success' });
}

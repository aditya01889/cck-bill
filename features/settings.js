/* Settings tab — environment info, backend endpoints, product catalog editor, and user management.
   Admin-only: visible only to users whose access list includes 'settings'. */
import { IS_PROD, ENV_LABEL, SHEET_WEBHOOK_URL, INGREDIENTS_WEBHOOK_URL,
         CATALOG, CATALOG_DEFAULTS, _rebuildProducts } from '/core/config.js';
import { escapeHtml } from '/core/dom.js';
import { saveCatalogToServer, getUsers, changePassword, addUser, updateUser, resetPassword } from '/core/api.js';
import { resetQuantities, renderProducts, updateTotals } from '/features/newbill.js';
import { currentRole } from '/core/auth.js';

function truncate(url, n) {
  return url.length > n ? url.slice(0, n) + '…' : url;
}

/* ---------- Catalog editor state ---------- */
let _editCatalog = null;

function _cloneForEdit(catalog) {
  const clone = JSON.parse(JSON.stringify(catalog));
  clone.forEach(cat => {
    if (cat.comboCategory) {
      cat.items.forEach(item => { item._pack = item.price24 !== undefined; });
    }
  });
  return clone;
}

/* Read current DOM form values back into a catalog array */
function _readFormState() {
  const catalog = [];
  document.querySelectorAll('#catalogEditor .cat-block').forEach(catEl => {
    const ci = parseInt(catEl.dataset.ci);
    const catName = catEl.querySelector('.cat-name').value.trim();
    const isCombo = catEl.querySelector('.cat-combo').checked;
    const items = [];
    catEl.querySelectorAll('.item-row').forEach(itemEl => {
      const name = itemEl.querySelector('.item-name').value.trim();
      if (isCombo) {
        const packCb = itemEl.querySelector('.item-pack');
        const isPack = packCb && packCb.checked;
        if (isPack) {
          items.push({
            name,
            price24: Number(itemEl.querySelector('.item-p24').value) || 0,
            price60: Number(itemEl.querySelector('.item-p60').value) || 0,
            _pack: true
          });
        } else {
          items.push({ name, price: Number(itemEl.querySelector('.item-price').value) || 0 });
        }
      } else {
        items.push({ name, price: Number(itemEl.querySelector('.item-price').value) || 0 });
      }
    });
    const cat = { category: catName, items };
    if (isCombo) cat.comboCategory = true;
    catalog.push(cat);
  });
  return catalog;
}

function _renderCatalogEditor() {
  const el = document.getElementById('catalogEditor');
  if (!el || !_editCatalog) return;

  let html = '';
  _editCatalog.forEach((cat, ci) => {
    html += `<div class="cat-block" data-ci="${ci}">`;
    html += `<div class="cat-head">`;
    html += `<input class="cat-name cat-editor-input" value="${escapeHtml(cat.category)}" placeholder="Category name">`;
    html += `<label class="cat-toggle-label"><input type="checkbox" class="cat-combo"${cat.comboCategory ? ' checked' : ''}> Combo packs</label>`;
    html += `<button class="cat-del btn-icon" title="Delete category">✕</button>`;
    html += `</div>`;

    html += `<div class="cat-items">`;
    cat.items.forEach((item, ii) => {
      const isPack = item._pack || item.price24 !== undefined;
      html += `<div class="item-row" data-ii="${ii}">`;
      html += `<input class="item-name cat-editor-input item-name-input" value="${escapeHtml(item.name)}" placeholder="Product name">`;
      if (cat.comboCategory) {
        html += `<label class="item-pack-label"><input type="checkbox" class="item-pack"${isPack ? ' checked' : ''}> Pack</label>`;
        if (isPack) {
          html += `<span class="price-lbl">×24 ₹</span><input class="item-p24 cat-editor-input price-input" type="number" min="0" value="${item.price24 || ''}">`;
          html += `<span class="price-lbl">×60 ₹</span><input class="item-p60 cat-editor-input price-input" type="number" min="0" value="${item.price60 || ''}">`;
        } else {
          html += `<span class="price-lbl">₹</span><input class="item-price cat-editor-input price-input" type="number" min="0" value="${item.price || ''}">`;
        }
      } else {
        html += `<span class="price-lbl">₹</span><input class="item-price cat-editor-input price-input" type="number" min="0" value="${item.price || ''}">`;
      }
      html += `<button class="item-del btn-icon" title="Remove item">✕</button>`;
      html += `</div>`;
    });
    html += `</div>`;
    html += `<button class="btn-link item-add" data-ci="${ci}">+ Add item</button>`;
    html += `</div>`;
  });

  html += `<button class="btn-link cat-add" style="margin-top:8px">+ Add category</button>`;
  el.innerHTML = html;

  /* ---- Wire structural change handlers ---- */

  el.querySelectorAll('.cat-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = parseInt(btn.closest('.cat-block').dataset.ci);
      const name = _editCatalog[ci] && _editCatalog[ci].category;
      if (_editCatalog[ci] && _editCatalog[ci].items.length > 0) {
        if (!confirm(`Delete "${name || 'this category'}" and all its items?`)) return;
      }
      _editCatalog = _readFormState();
      _editCatalog.splice(ci, 1);
      _renderCatalogEditor();
    });
  });

  el.querySelectorAll('.cat-combo').forEach(cb => {
    cb.addEventListener('change', () => {
      _editCatalog = _readFormState();
      const ci = parseInt(cb.closest('.cat-block').dataset.ci);
      if (_editCatalog[ci]) _editCatalog[ci].comboCategory = cb.checked || undefined;
      _renderCatalogEditor();
    });
  });

  el.querySelectorAll('.item-pack').forEach(cb => {
    cb.addEventListener('change', () => {
      _editCatalog = _readFormState();
      const ci = parseInt(cb.closest('.cat-block').dataset.ci);
      const ii = parseInt(cb.closest('.item-row').dataset.ii);
      const item = _editCatalog[ci] && _editCatalog[ci].items[ii];
      if (item) {
        item._pack = cb.checked;
        if (cb.checked) {
          item.price24 = item.price24 || 0;
          item.price60 = item.price60 || 0;
          delete item.price;
        } else {
          item.price = item.price || 0;
          delete item.price24;
          delete item.price60;
        }
      }
      _renderCatalogEditor();
    });
  });

  el.querySelectorAll('.item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      _editCatalog = _readFormState();
      const ci = parseInt(btn.closest('.cat-block').dataset.ci);
      const ii = parseInt(btn.closest('.item-row').dataset.ii);
      if (_editCatalog[ci]) _editCatalog[ci].items.splice(ii, 1);
      _renderCatalogEditor();
    });
  });

  el.querySelectorAll('.item-add').forEach(btn => {
    btn.addEventListener('click', () => {
      _editCatalog = _readFormState();
      const ci = parseInt(btn.dataset.ci);
      const isCombo = _editCatalog[ci] && _editCatalog[ci].comboCategory;
      _editCatalog[ci].items.push(isCombo
        ? { name: '', price24: 0, price60: 0, _pack: true }
        : { name: '', price: 0 });
      _renderCatalogEditor();
      const catEl = el.querySelector(`[data-ci="${ci}"]`);
      if (catEl) {
        const rows = catEl.querySelectorAll('.item-row');
        const last = rows[rows.length - 1];
        if (last) last.querySelector('.item-name').focus();
      }
    });
  });

  el.querySelector('.cat-add').addEventListener('click', () => {
    _editCatalog = _readFormState();
    _editCatalog.push({ category: '', items: [{ name: '', price: 0 }] });
    _renderCatalogEditor();
    const cats = el.querySelectorAll('.cat-block');
    const last = cats[cats.length - 1];
    if (last) last.querySelector('.cat-name').focus();
  });
}

function _stripUIFlags(catalog) {
  return catalog.map(cat => {
    const c = { category: cat.category, items: cat.items.map(item => {
      const it = { ...item };
      delete it._pack;
      return it;
    }) };
    if (cat.comboCategory) c.comboCategory = true;
    return c;
  });
}

async function _saveCatalog() {
  const btn = document.getElementById('saveCatalogBtn');
  const raw = _readFormState();

  for (const cat of raw) {
    if (!cat.category) { alert('All categories must have a name.'); return; }
    for (const item of cat.items) {
      if (!item.name) { alert(`All items in "${cat.category}" must have a name.`); return; }
    }
  }

  const clean = _stripUIFlags(raw);
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await saveCatalogToServer(clean);
    _rebuildProducts(clean);
    resetQuantities();
    renderProducts();
    updateTotals();
    _editCatalog = _cloneForEdit(CATALOG);
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Save Catalog'; btn.disabled = false; }, 2000);
  } catch(e) {
    btn.textContent = 'Save Catalog';
    btn.disabled = false;
    alert('Failed to save catalog. Please try again.');
  }
}

async function _resetCatalogToDefaults() {
  if (!confirm('Reset catalog to factory defaults? Any custom changes will be lost.')) return;
  const btn = document.getElementById('resetCatalogBtn');
  btn.disabled = true;
  btn.textContent = 'Resetting…';
  try {
    await saveCatalogToServer(null);
    _rebuildProducts(JSON.parse(JSON.stringify(CATALOG_DEFAULTS)));
    resetQuantities();
    renderProducts();
    updateTotals();
    _editCatalog = _cloneForEdit(CATALOG);
    _renderCatalogEditor();
    btn.textContent = 'Reset to Defaults';
    btn.disabled = false;
  } catch(e) {
    btn.textContent = 'Reset to Defaults';
    btn.disabled = false;
    alert('Failed to reset catalog. Please try again.');
  }
}

/* ---------- User management ---------- */

function _setMsg(id, text, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'settings-msg ' + (isError ? 'settings-msg-err' : 'settings-msg-ok');
}

async function _changePassword() {
  const btn  = document.getElementById('changePwdBtn');
  const cur  = document.getElementById('curPwdInput').value;
  const nw   = document.getElementById('newPwdInput').value;
  const conf = document.getElementById('confPwdInput').value;
  if (!cur || !nw || !conf) { _setMsg('changePwdMsg', 'All fields are required.', true); return; }
  if (nw.length < 6)        { _setMsg('changePwdMsg', 'New password must be at least 6 characters.', true); return; }
  if (nw !== conf)          { _setMsg('changePwdMsg', 'New passwords do not match.', true); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await changePassword(cur, nw);
    document.getElementById('curPwdInput').value  = '';
    document.getElementById('newPwdInput').value  = '';
    document.getElementById('confPwdInput').value = '';
    _setMsg('changePwdMsg', 'Password changed successfully.', false);
  } catch (e) {
    _setMsg('changePwdMsg', e.message || 'Failed to change password.', true);
  } finally {
    btn.disabled = false; btn.textContent = 'Change Password';
  }
}

async function _loadUsersList() {
  const el = document.getElementById('userMgmtList');
  if (!el) return;
  el.innerHTML = '<span class="settings-loading">Loading users…</span>';
  try {
    const users = await getUsers();
    if (!users.length) { el.innerHTML = '<span class="settings-loading">No users found.</span>'; return; }
    el.innerHTML = users.map(u => `
      <div class="user-row" data-username="${escapeHtml(u.username)}">
        <span class="user-row-name">${escapeHtml(u.username)}</span>
        <select class="user-role-sel cat-editor-input" data-username="${escapeHtml(u.username)}">
          <option value="staff"${u.role === 'staff' ? ' selected' : ''}>staff</option>
          <option value="admin"${u.role === 'admin' ? ' selected' : ''}>admin</option>
        </select>
        <button class="btn btn-secondary user-active-btn" data-username="${escapeHtml(u.username)}" data-active="${u.active}">
          ${u.active ? 'Disable' : 'Enable'}
        </button>
        <button class="btn btn-secondary user-resetpwd-btn" data-username="${escapeHtml(u.username)}">Reset Pwd</button>
      </div>
    `).join('');

    el.querySelectorAll('.user-role-sel').forEach(sel => {
      sel.addEventListener('change', async () => {
        const uname = sel.dataset.username;
        const prev  = sel.querySelector('option:not([value="' + sel.value + '"])').value;
        sel.disabled = true;
        try {
          await updateUser(uname, { role: sel.value });
        } catch (e) {
          sel.value = prev;
          _setMsg('userMgmtMsg', e.message || 'Failed to update role.', true);
        } finally {
          sel.disabled = false;
        }
      });
    });

    el.querySelectorAll('.user-active-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uname  = btn.dataset.username;
        const active = btn.dataset.active === 'true';
        btn.disabled = true;
        try {
          await updateUser(uname, { active: !active });
          btn.dataset.active = String(!active);
          btn.textContent = !active ? 'Disable' : 'Enable';
        } catch (e) {
          _setMsg('userMgmtMsg', e.message || 'Failed to update user.', true);
        } finally {
          btn.disabled = false;
        }
      });
    });

    el.querySelectorAll('.user-resetpwd-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uname = btn.dataset.username;
        const newPwd = prompt('Set new password for "' + uname + '" (min 6 chars):');
        if (!newPwd) return;
        if (newPwd.length < 6) { _setMsg('userMgmtMsg', 'Password must be at least 6 characters.', true); return; }
        btn.disabled = true;
        try {
          await resetPassword(uname, newPwd);
          _setMsg('userMgmtMsg', 'Password reset for ' + uname + '.', false);
        } catch (e) {
          _setMsg('userMgmtMsg', e.message || 'Failed to reset password.', true);
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    el.innerHTML = '<span class="settings-loading">Failed to load users: ' + escapeHtml(e.message) + '</span>';
  }
}

async function _addUser() {
  const btn   = document.getElementById('addUserBtn');
  const uname = document.getElementById('addUserName').value.trim();
  const pwd   = document.getElementById('addUserPwd').value;
  const role  = document.getElementById('addUserRole').value;
  if (!uname || !pwd) { _setMsg('userMgmtMsg', 'Username and password are required.', true); return; }
  if (pwd.length < 6) { _setMsg('userMgmtMsg', 'Password must be at least 6 characters.', true); return; }
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    await addUser(uname, pwd, role);
    document.getElementById('addUserName').value = '';
    document.getElementById('addUserPwd').value  = '';
    _setMsg('userMgmtMsg', 'User "' + uname + '" added.', false);
    _loadUsersList();
  } catch (e) {
    _setMsg('userMgmtMsg', e.message || 'Failed to add user.', true);
  } finally {
    btn.disabled = false; btn.textContent = 'Add User';
  }
}

export function loadSettings() {
  const el = document.getElementById('tab-settings');
  if (!el) return;

  if (!_editCatalog) _editCatalog = _cloneForEdit(CATALOG);

  const envClass = IS_PROD ? 'env-prod' : 'env-dev';
  const isAdmin  = currentRole === 'admin';

  el.innerHTML = `
    <div class="wrap">
      <div class="settings-card">
        <div class="settings-card-title">Environment</div>
        <div class="settings-row">
          <span class="settings-label">Status</span>
          <span class="env-badge ${escapeHtml(envClass)}">${escapeHtml(ENV_LABEL)}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">Host</span>
          <code class="settings-code">${escapeHtml(location.hostname)}</code>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">Backend</div>
        <div class="settings-row">
          <span class="settings-label">Orders API</span>
          <code class="settings-code">${escapeHtml(truncate(SHEET_WEBHOOK_URL, 55))}</code>
        </div>
        <div class="settings-row">
          <span class="settings-label">Ingredients API</span>
          <code class="settings-code">${escapeHtml(truncate(INGREDIENTS_WEBHOOK_URL, 55))}</code>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">Change Password</div>
        <div class="settings-field-row">
          <label class="settings-field-label">Current password</label>
          <input type="password" id="curPwdInput" class="cat-editor-input settings-field-input" autocomplete="current-password">
        </div>
        <div class="settings-field-row">
          <label class="settings-field-label">New password</label>
          <input type="password" id="newPwdInput" class="cat-editor-input settings-field-input" autocomplete="new-password">
        </div>
        <div class="settings-field-row">
          <label class="settings-field-label">Confirm new</label>
          <input type="password" id="confPwdInput" class="cat-editor-input settings-field-input" autocomplete="new-password">
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-primary" id="changePwdBtn">Change Password</button>
        </div>
        <div id="changePwdMsg" class="settings-msg" style="margin-top:8px"></div>
      </div>

      ${isAdmin ? `
      <div class="settings-card">
        <div class="settings-card-title">User Management</div>
        <div id="userMgmtList"></div>
        <hr class="settings-section-divider">
        <div class="settings-card-subtitle">Add User</div>
        <div class="settings-add-user-row">
          <input type="text" id="addUserName" class="cat-editor-input" placeholder="Username" autocomplete="off">
          <input type="password" id="addUserPwd" class="cat-editor-input" placeholder="Password (min 6 chars)" autocomplete="new-password">
          <select id="addUserRole" class="cat-editor-input">
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
          <button class="btn btn-secondary" id="addUserBtn">Add User</button>
        </div>
        <div id="userMgmtMsg" class="settings-msg" style="margin-top:8px"></div>
      </div>
      ` : ''}

      <div class="settings-card">
        <div class="settings-card-title">Product Catalog</div>
        <div class="catalog-btns">
          <button class="btn btn-primary" id="saveCatalogBtn">Save Catalog</button>
          <button class="btn btn-secondary" id="resetCatalogBtn">Reset to Defaults</button>
        </div>
        <div id="catalogEditor"></div>
      </div>
    </div>
  `;

  _renderCatalogEditor();
  document.getElementById('saveCatalogBtn').addEventListener('click', _saveCatalog);
  document.getElementById('resetCatalogBtn').addEventListener('click', _resetCatalogToDefaults);
  document.getElementById('changePwdBtn').addEventListener('click', _changePassword);

  if (isAdmin) {
    document.getElementById('addUserBtn').addEventListener('click', _addUser);
    _loadUsersList();
  }
}

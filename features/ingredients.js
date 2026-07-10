/* Ingredient Calculator tab — matrix fetch, order selection, totals. */
import { INGREDIENTS_WEBHOOK_URL } from '/core/config.js';
import { authUrl } from '/core/auth.js';
import { fetchWithTimeout } from '/core/config.js';
import { getOrders, parseItemsSummary } from '/core/api.js';
import { ordersState } from '/core/state.js';

/* ---- Ingredient mapping: bill product name → matrix product(s) ---- */
const BILL_TO_INGREDIENT = {
  "Nourish":    [{ product: "Nourish", mult: 1 }],
  "Vitality":   [{ product: "Vitality", mult: 1 }],
  "Power":      [{ product: "Power", mult: 1 }],
  "Supreme":    [{ product: "Supreme", mult: 1 }],
  "Nurture":    [{ product: "Nurture", mult: 1 }],
  "Thrive":     [{ product: "Thrive", mult: 1 }],
  "Essence":    [{ product: "Essence", mult: 1 }],
  "Bone Rich":  [{ product: "Bone Rich", mult: 1 }],
  "Cookies 100g":  [{ product: "Cookies Chicken", mult: 1 }],
  "Cookies 200g":  [{ product: "Cookies Chicken", mult: 2 }],
  "Happy Tummy Cupcake (pack of 2)":          [{ product: "Cupcake", mult: 1 }],
  "Purr-fect Protein Cupcake (pack of 2)":    [{ product: "Cupcake", mult: 1 }],
  "Veggie Mew Cupcake (pack of 2)":           [{ product: "Cupcake", mult: 1 }],
  "Tuna Delight Cupcake (pack of 2)":         [{ product: "Cupcake", mult: 1 }],
  "Fruity Paws Cupcake (pack of 2)":          [{ product: "Cupcake", mult: 1 }],
  "Golden Glow Cupcake (pack of 2)":          [{ product: "Cupcake", mult: 1 }],
  "Nourish (Pack of 24)":   [{ product: "Nourish", mult: 24 }],
  "Vitality (Pack of 24)":  [{ product: "Vitality", mult: 24 }],
  "Power (Pack of 24)":     [{ product: "Power", mult: 24 }],
  "Supreme (Pack of 24)":   [{ product: "Supreme", mult: 24 }],
  "Nurture (Pack of 24)":   [{ product: "Nurture", mult: 24 }],
  "Thrive (Pack of 24)":    [{ product: "Thrive", mult: 24 }],
  "Assorted (Pack of 24 / 4 Each)": [
    { product: "Nourish",  mult: 4 },
    { product: "Vitality", mult: 4 },
    { product: "Power",    mult: 4 },
    { product: "Supreme",  mult: 4 },
    { product: "Nurture",  mult: 4 },
    { product: "Thrive",   mult: 4 }
  ],
  "Nourish (Pack of 60)":   [{ product: "Nourish", mult: 60 }],
  "Vitality (Pack of 60)":  [{ product: "Vitality", mult: 60 }],
  "Power (Pack of 60)":     [{ product: "Power", mult: 60 }],
  "Supreme (Pack of 60)":   [{ product: "Supreme", mult: 60 }],
  "Nurture (Pack of 60)":   [{ product: "Nurture", mult: 60 }],
  "Thrive (Pack of 60)":    [{ product: "Thrive", mult: 60 }],
  "Assorted (Pack of 60 / 10 Each)": [
    { product: "Nourish",  mult: 10 },
    { product: "Vitality", mult: 10 },
    { product: "Power",    mult: 10 },
    { product: "Supreme",  mult: 10 },
    { product: "Nurture",  mult: 10 },
    { product: "Thrive",   mult: 10 }
  ],
  "Starter Kit (Assorted Pack of 12)": [
    { product: "Nourish",  mult: 2 },
    { product: "Vitality", mult: 2 },
    { product: "Power",    mult: 2 },
    { product: "Supreme",  mult: 2 },
    { product: "Nurture",  mult: 2 },
    { product: "Thrive",   mult: 2 }
  ]
};

/* ---- Module state ---- */
let _ingMatrix = null;
let _ingMatrixPromise = null;
let _ingIngredients = [];
let _ingOrders = [];
let _ingSelected = new Set();
let _ingCheckedIngs = {};

/* ---- Matrix fetch ---- */

export function loadIngMatrix() {
  if (_ingMatrix) return Promise.resolve();
  if (_ingMatrixPromise) return _ingMatrixPromise;
  _ingMatrixPromise = (async () => {
    if (!INGREDIENTS_WEBHOOK_URL) {
      _ingMatrix = {};
      _ingIngredients = [];
      return;
    }
    try {
      const res = await fetchWithTimeout(authUrl(`${INGREDIENTS_WEBHOOK_URL}?action=matrix`), {}, 10000);
      const data = await res.json();
      if (data.status === 'success') {
        _ingMatrix = data.matrix;
        _ingIngredients = data.ingredients;
      } else {
        _ingMatrix = {};
      }
    } catch (e) {
      _ingMatrix = {};
    }
  })();
  return _ingMatrixPromise;
}

/* ---- Order loading ---- */

async function loadIngOrders() {
  const packed = new Set(['Packed', 'Booked', 'Picked Up', 'Dispatched', 'Delivered']);
  if (!ordersState.loaded) {
    document.getElementById('ingOrdersList').innerHTML = '<div class="orders-loading">Loading orders…</div>';
  }
  let allOrders;
  try {
    allOrders = await getOrders();
  } catch (e) {
    if (e.message === 'Unauthorized') return;
    document.getElementById('ingOrdersList').innerHTML = '<div class="orders-loading">Failed to load orders.</div>';
    return;
  }
  _ingOrders = allOrders.filter(o =>
    o.paymentStatus === 'Paid' && !packed.has(String(o.fulfillmentStatus || '').trim())
  );
  _ingOrders.sort((a, b) => {
    const da = a.dispatchDate || '';
    const db = b.dispatchDate || '';
    if (da !== db) return da < db ? -1 : 1;
    return String(a.billNo || '').localeCompare(String(b.billNo || ''));
  });
  renderIngOrders();
}

/* ---- Rendering ---- */

function renderIngOrders() {
  const el = document.getElementById('ingOrdersList');
  if (!_ingOrders.length) {
    el.innerHTML = '<div class="orders-loading">No paid orders found.</div>';
    return;
  }
  el.innerHTML = _ingOrders.map(order => {
    const sel = _ingSelected.has(order.billNo);
    const dispatch = order.dispatchDate ? `Dispatch: ${order.dispatchDate}` : '';
    return `<div class="ing-order-card${sel ? ' ing-selected' : ''}" data-bill="${order.billNo}">
      <input type="checkbox" ${sel ? 'checked' : ''} data-bill="${order.billNo}">
      <div class="ing-order-info">
        <div class="ing-order-name">${order.name} — ${order.billNo}</div>
        <div class="ing-order-meta">₹${order.totalAmount} · ${order.totalItems} item${order.totalItems !== 1 ? 's' : ''}</div>
        ${dispatch ? `<div class="ing-order-dispatch">${dispatch}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.ing-order-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      toggleIngSelection(card.dataset.bill);
    });
    const cb = card.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => toggleIngSelection(card.dataset.bill));
  });
}

function toggleIngSelection(billNo) {
  if (_ingSelected.has(billNo)) _ingSelected.delete(billNo);
  else _ingSelected.add(billNo);
  renderIngOrders();
  updateIngCalcPanel();
}

function updateIngCalcPanel() {
  const count = _ingSelected.size;
  const bar = document.getElementById('ingSelectedBar');
  const panel = document.getElementById('ingCalcPanel');
  if (count === 0) {
    bar.style.display = 'none';
    panel.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  document.getElementById('ingSelectedCount').textContent = `${count} order${count !== 1 ? 's' : ''} selected`;
  panel.style.display = 'block';

  const activeSubTab = document.querySelector('.ing-sub-tab.active');
  const itab = activeSubTab ? activeSubTab.dataset.itab : 'buying';
  if (itab === 'buying') renderIngBuying();
  else renderIngMaking();
}

function expandBillItems(items) {
  const result = [];
  items.forEach(({ name, qty }) => {
    const mappings = BILL_TO_INGREDIENT[name];
    if (!mappings) return;
    mappings.forEach(({ product, mult }) => {
      result.push({ product, qty: qty * mult });
    });
  });
  return result;
}

function computeIngTotals(selectedBillNos) {
  const totals = {};
  _ingOrders.forEach(order => {
    if (!selectedBillNos.has(order.billNo)) return;
    const items = parseItemsSummary(order.itemsSummary);
    const expanded = expandBillItems(items);
    expanded.forEach(({ product, qty }) => {
      const ingMap = _ingMatrix[product];
      if (!ingMap) return;
      Object.entries(ingMap).forEach(([ing, perUnit]) => {
        totals[ing] = (totals[ing] || 0) + perUnit * qty;
      });
    });
  });
  return totals;
}

function getSelectedProductTotals() {
  const prod = {};
  _ingOrders.forEach(order => {
    if (!_ingSelected.has(order.billNo)) return;
    const items = parseItemsSummary(order.itemsSummary);
    const expanded = expandBillItems(items);
    expanded.forEach(({ product, qty }) => {
      if (_ingMatrix[product]) prod[product] = (prod[product] || 0) + qty;
    });
  });
  return prod;
}

function renderIngBuying() {
  const totals = computeIngTotals(_ingSelected);
  const list = document.getElementById('ingBuyingList');
  const ings = _ingIngredients.length ? _ingIngredients : Object.keys(totals);
  const rows = ings.filter(ing => totals[ing] > 0).map(ing => {
    const qty = totals[ing];
    const display = Number.isInteger(qty) ? qty : parseFloat(qty.toFixed(3));
    const checked = _ingCheckedIngs[ing] !== false;
    return `<div class="ing-ing-row">
      <input type="checkbox" ${checked ? 'checked' : ''} data-ing="${ing}" class="ing-buy-cb">
      <span class="ing-ing-name">${ing}</span>
      <span class="ing-ing-qty">${display}g</span>
    </div>`;
  }).join('');
  list.innerHTML = rows || '<div style="padding:12px;color:var(--muted);font-size:13px;">No ingredients found for selected orders.</div>';

  list.querySelectorAll('.ing-buy-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      _ingCheckedIngs[cb.dataset.ing] = cb.checked;
    });
  });
}

function renderIngMaking() {
  const prodTotals = getSelectedProductTotals();
  const radios = document.getElementById('ingMakingRadios');
  const products = Object.entries(prodTotals);
  if (!products.length) {
    radios.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:13px;">No mappable products in selected orders.</div>';
    document.getElementById('ingMakingResult').style.display = 'none';
    return;
  }
  radios.innerHTML = products.map(([product, qty], idx) => {
    return `<label class="ing-radio-row">
      <input type="radio" name="ingProduct" value="${product}" ${idx === 0 ? 'checked' : ''}>
      <div>
        <div class="ing-radio-label">${product}</div>
        <div class="ing-radio-sub">${qty} unit${qty !== 1 ? 's' : ''} across selected orders</div>
      </div>
    </label>`;
  }).join('');

  radios.querySelectorAll('input[type="radio"]').forEach(r => {
    r.addEventListener('change', () => showMakingIngredients(r.value, prodTotals[r.value]));
  });
  showMakingIngredients(products[0][0], products[0][1]);
}

function showMakingIngredients(product, totalQty) {
  const resultEl = document.getElementById('ingMakingResult');
  const titleEl = document.getElementById('ingMakingProductTitle');
  const listEl = document.getElementById('ingMakingIngList');
  const ingMap = _ingMatrix[product];
  if (!ingMap) { resultEl.style.display = 'none'; return; }
  titleEl.textContent = `${product} — ${totalQty} unit${totalQty !== 1 ? 's' : ''}`;
  const ings = _ingIngredients.length ? _ingIngredients : Object.keys(ingMap);
  listEl.innerHTML = ings.filter(ing => ingMap[ing] > 0).map(ing => {
    const perUnit = ingMap[ing];
    const total = perUnit * totalQty;
    const displayTotal = Number.isInteger(total) ? total : parseFloat(total.toFixed(3));
    const displayPer = Number.isInteger(perUnit) ? perUnit : parseFloat(perUnit.toFixed(3));
    return `<div class="ing-ing-row">
      <span class="ing-ing-name">${ing}</span>
      <span class="ing-ing-qty">${displayPer}g × ${totalQty} = ${displayTotal}g</span>
    </div>`;
  }).join('') || '<div style="padding:12px;color:var(--muted);font-size:13px;">No ingredients on record.</div>';
  resultEl.style.display = 'block';
}

/* ---- Main tab loading function ---- */

export async function loadIngredientTab() {
  const matrixPromise = loadIngMatrix();
  if (!_ingOrders.length) await loadIngOrders();
  else renderIngOrders();
  await matrixPromise;
  updateIngCalcPanel();
}

/* ---- Wire event handlers (called once from main.js) ---- */

export function initIngredients() {
  document.getElementById('ingSubTabBuying').addEventListener('click', () => {
    document.querySelectorAll('.ing-sub-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('ingSubTabBuying').classList.add('active');
    document.getElementById('ing-itab-buying').style.display = '';
    document.getElementById('ing-itab-making').style.display = 'none';
    renderIngBuying();
  });

  document.getElementById('ingSubTabMaking').addEventListener('click', () => {
    document.querySelectorAll('.ing-sub-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('ingSubTabMaking').classList.add('active');
    document.getElementById('ing-itab-buying').style.display = 'none';
    document.getElementById('ing-itab-making').style.display = '';
    renderIngMaking();
  });

  document.getElementById('ingClearBtn').addEventListener('click', () => {
    _ingSelected.clear();
    renderIngOrders();
    updateIngCalcPanel();
  });

  document.getElementById('ingShareBtn').addEventListener('click', () => {
    const totals = computeIngTotals(_ingSelected);
    const ings = _ingIngredients.length ? _ingIngredients : Object.keys(totals);
    const lines = ings.filter(ing => {
      const checked = _ingCheckedIngs[ing] !== false;
      return checked && totals[ing] > 0;
    }).map(ing => {
      const qty = totals[ing];
      const display = Number.isInteger(qty) ? qty : parseFloat(qty.toFixed(3));
      return `• ${ing}: ${display}g`;
    });
    if (!lines.length) { alert('No ingredients selected.'); return; }
    const orderNos = [..._ingSelected].join(', ');
    const text = `*CCK Ingredient List*\nOrders: ${orderNos}\n\n${lines.join('\n')}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  });
}

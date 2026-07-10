/* New Bill feature — product list, bill generation, QR, sharing. */
import { PRODUCTS, UPI_ID, UPI_PAYEE_NAME } from '/core/config.js';
import { escapeHtml, setStatus, openOverlay, closeOverlay } from '/core/dom.js';
import { _authToken, currentUser } from '/core/auth.js';
import { logToSheet, invalidateOrders, parseItemsFull, updateOrderInSheet } from '/core/api.js';
import { navigateTo } from '/core/router.js';
import { customersState } from '/core/state.js';

/* ---- Edit state ---- */
let _editOrder = null;

/* ---- Quantities state ---- */
export let quantities = PRODUCTS.map(() => 0);

export function resetQuantities() {
  quantities = PRODUCTS.map(() => 0);
}

/* ---- Product list rendering ---- */

export function renderProducts() {
  const container = document.getElementById('productList');
  let html = '';
  let lastCat = null;
  PRODUCTS.forEach((p, i) => {
    if (p.category !== lastCat) {
      if (lastCat !== null) html += '</div>';
      html += `<div class="cat-label">${escapeHtml(p.category)}</div><div class="product-list">`;
      lastCat = p.category;
    }
    html += `
      <div class="product-row ${quantities[i] === 0 ? 'zero' : ''}" data-idx="${i}">
        <div class="p-info">
          <div class="p-name">${escapeHtml(p.name)}</div>
          <div class="p-price">₹${p.price.toLocaleString('en-IN')}</div>
        </div>
        <div class="counter">
          <button type="button" data-action="dec" data-idx="${i}">−</button>
          <input class="qty" type="number" inputmode="numeric" min="0" step="1" value="${quantities[i]}" data-idx="${i}">
          <button type="button" data-action="inc" data-idx="${i}">+</button>
        </div>
      </div>`;
  });
  if (lastCat !== null) html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'inc') {
        quantities[i]++;
      } else {
        quantities[i] = Math.max(0, quantities[i] - 1);
      }
      renderProducts();
      updateTotals();
    });
  });

  container.querySelectorAll('input.qty').forEach(input => {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.idx, 10);
      let val = parseInt(input.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      quantities[i] = val;
      renderProducts();
      updateTotals();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  });
}

export function updateTotals() {
  let items = 0, productsTotal = 0;
  PRODUCTS.forEach((p, i) => {
    items += quantities[i];
    productsTotal += quantities[i] * p.price;
  });
  const deliveryCharges = parseFloat(document.getElementById('deliveryCharges').value) || 0;
  const discountPercent = Math.min(100, Math.max(0, parseFloat(document.getElementById('discountPercent').value) || 0));
  const discountAmount  = Math.round(productsTotal * discountPercent / 100);
  const rupeeSpan = document.getElementById('discountRupees');
  rupeeSpan.textContent = discountAmount > 0 ? `−₹${discountAmount.toLocaleString('en-IN')}` : '';
  document.getElementById('totalItems').textContent = items;
  document.getElementById('totalAmount').textContent = (productsTotal + deliveryCharges - discountAmount).toLocaleString('en-IN');
}

/* ---- Utilities ---- */

export function genBillNo() {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return 'CCK' + d.getFullYear().toString().slice(-2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + '-' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0') + '-' + rand;
}

export function formatDispatchRange(fromRaw, toRaw) {
  const fmt = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  if (fromRaw && toRaw) {
    if (fromRaw === toRaw) return fmt(fromRaw);
    return `${fmt(fromRaw)} - ${fmt(toRaw)}`;
  }
  if (fromRaw) return fmt(fromRaw);
  if (toRaw) return fmt(toRaw);
  return '';
}

export async function renderBillToCanvas() {
  const billCard = document.getElementById('billCard');
  return await html2canvas(billCard, { scale: 2, backgroundColor: '#ffffff' });
}

export function generatePaymentQR(amount, billNo) {
  const container = document.getElementById('qrContainer');
  container.innerHTML = '';
  if (!UPI_ID) {
    document.getElementById('bPayBox').style.display = 'none';
    return;
  }
  document.getElementById('bPayBox').style.display = 'block';
  const formattedAmount = amount.toFixed(2);
  const upiUrl = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('Order ' + billNo)}`;
  new QRCode(container, {
    text: upiUrl,
    width: 128,
    height: 128,
    colorDark: "#1C1A17",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

export function positionOverlayActions() {
  const overlay = document.getElementById('billOverlay');
  const wrap = document.getElementById('overlayActionsWrap');
  overlay.appendChild(wrap);
  wrap.style.position = 'sticky';
  wrap.style.bottom = '0';
  wrap.style.background = 'transparent';
  wrap.style.paddingTop = '6px';
  wrap.style.paddingBottom = '10px';
}

/* ---- Edit helpers ---- */

const _EDIT_MON = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

function _dateToISO(str) {
  if (!str) return '';
  const m = String(str).trim().match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return '';
  const mon = _EDIT_MON[m[2].toLowerCase()];
  if (mon == null) return '';
  const d = new Date(parseInt(m[3],10), mon, parseInt(m[1],10));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _parseDispatchRange(display) {
  if (!display) return { from: '', to: '' };
  const parts = String(display).split(' - ');
  const from = _dateToISO(parts[0]);
  const to   = _dateToISO(parts[1] || parts[0]);
  return { from, to: to !== from ? to : '' };
}

function _clearEditState() {
  _editOrder = null;
  document.getElementById('editModeBanner').style.display = 'none';
  document.getElementById('generateBtn').textContent = 'Generate Bill';
}

export function loadOrderForEdit(order) {
  _editOrder = order;

  navigateTo('newbill');

  // Show edit banner
  document.getElementById('editBillRef').textContent = order.billNo;
  document.getElementById('editModeBanner').style.display = 'flex';
  document.getElementById('generateBtn').textContent = 'Save Changes';

  // Customer details
  document.getElementById('custName').value    = order.name    || '';
  document.getElementById('custPhone').value   = order.phone   || '';
  document.getElementById('custEmail').value   = order.email   || '';
  document.getElementById('custAddress').value = order.address || '';

  // Restore product quantities from itemsSummary
  quantities = PRODUCTS.map(() => 0);
  const parsedItems = parseItemsFull(order.itemsSummary);
  parsedItems.forEach(item => {
    const idx = PRODUCTS.findIndex(p => p.name === item.name);
    if (idx !== -1) quantities[idx] = item.qty;
  });
  renderProducts();

  // Delivery charges
  document.getElementById('deliveryCharges').value =
    Number(order.deliveryCharges) > 0 ? order.deliveryCharges : '';

  // Discount: stored as ₹ amount — reverse to percentage
  const productsTotal = parsedItems.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmt   = Number(order.discount) || 0;
  if (discountAmt > 0 && productsTotal > 0) {
    document.getElementById('discountPercent').value =
      parseFloat(((discountAmt / productsTotal) * 100).toFixed(2));
  } else {
    document.getElementById('discountPercent').value = '';
  }

  updateTotals();

  // Dispatch dates
  const dispatch = _parseDispatchRange(order.dispatchDate);
  document.getElementById('dispatchFrom').value = dispatch.from || todayISO();
  document.getElementById('dispatchTo').value   = dispatch.to   || '';

  // Other fields
  document.getElementById('deliveryType').value = order.deliveryType || 'Local';
  document.getElementById('mapLink').value      = order.mapLink      || '';
  document.getElementById('remarks').value      = order.remarks      || '';

  // Clear validation errors
  ['nameError','phoneError','emailError'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  ['custName','custPhone','custEmail'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---- Bill generation event handler ---- */

let lastBillFilename = 'CozyCatKitchen-Bill.png';
let lastBillNo = '';
let lastShareToken = '';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function initNewBill() {
  document.getElementById('deliveryCharges').addEventListener('input', updateTotals);
  document.getElementById('discountPercent').addEventListener('input', updateTotals);

  function setFieldError(inputId, errorId, msg) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errorId);
    if (msg) { err.textContent = msg; input.classList.add('invalid'); }
    else      { err.textContent = '';  input.classList.remove('invalid'); }
  }

  const nameInput  = document.getElementById('custName');
  const phoneInput = document.getElementById('custPhone');
  const emailInput = document.getElementById('custEmail');

  nameInput.addEventListener('blur', () => {
    setFieldError('custName', 'nameError', nameInput.value.trim() ? '' : 'Name is required.');
  });
  nameInput.addEventListener('input', () => setFieldError('custName', 'nameError', ''));

  phoneInput.addEventListener('blur', () => {
    const v = phoneInput.value.trim().replace(/[\s\-]/g, '');
    setFieldError('custPhone', 'phoneError', v && !/^\d{10}$/.test(v) ? 'Enter a valid 10-digit number.' : '');
  });
  phoneInput.addEventListener('input', () => setFieldError('custPhone', 'phoneError', ''));

  emailInput.addEventListener('blur', () => {
    const v = emailInput.value.trim();
    setFieldError('custEmail', 'emailError', v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Enter a valid email address.' : '');
  });
  emailInput.addEventListener('input', () => setFieldError('custEmail', 'emailError', ''));

  const fromInput = document.getElementById('dispatchFrom');
  const toInput   = document.getElementById('dispatchTo');
  fromInput.value = todayISO();
  toInput.min = fromInput.value;
  fromInput.addEventListener('change', () => {
    toInput.min = fromInput.value;
    if (toInput.value && toInput.value < fromInput.value) toInput.value = fromInput.value;
  });
  toInput.addEventListener('change', () => {
    if (toInput.value && fromInput.value && toInput.value < fromInput.value) toInput.value = fromInput.value;
  });

  document.getElementById('generateBtn').addEventListener('click', () => {
    document.getElementById('generateBtn').disabled = true;
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    const remarks = document.getElementById('remarks').value.trim();
    const deliveryCharges = parseFloat(document.getElementById('deliveryCharges').value) || 0;
    const discountPercent = Math.min(100, Math.max(0, parseFloat(document.getElementById('discountPercent').value) || 0));
    const dispatchFromRaw = document.getElementById('dispatchFrom').value;
    const dispatchToRaw = document.getElementById('dispatchTo').value;
    const mapLink = document.getElementById('mapLink').value.trim();
    const deliveryType = document.getElementById('deliveryType').value;

    const selected = [];
    PRODUCTS.forEach((p, i) => {
      if (quantities[i] > 0) {
        selected.push({ name: p.name, qty: quantities[i], price: p.price, lineTotal: p.price * quantities[i], category: p.category });
      }
    });

    const _reEnableBtn = () => { document.getElementById('generateBtn').disabled = false; };

    if (!name) { setStatus('Please enter customer name.', 'err'); _reEnableBtn(); return; }
    if (phone && !/^\d{10}$/.test(phone.replace(/[\s\-]/g, ''))) { setStatus('Phone number must be 10 digits.', 'err'); _reEnableBtn(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('Please enter a valid email address.', 'err'); _reEnableBtn(); return; }
    if (selected.length === 0) { setStatus('Please select at least one product.', 'err'); _reEnableBtn(); return; }
    if (dispatchFromRaw && dispatchToRaw && dispatchToRaw < dispatchFromRaw) { setStatus('Dispatch "To" date cannot be before "From" date.', 'err'); _reEnableBtn(); return; }

    const totalItems = selected.reduce((s, p) => s + p.qty, 0);
    const productsTotal = selected.reduce((s, p) => s + p.lineTotal, 0);
    const discountAmount = Math.round(productsTotal * discountPercent / 100);
    const grandTotal = productsTotal + deliveryCharges - discountAmount;
    const isEdit  = !!_editOrder;
    const billNo  = isEdit ? _editOrder.billNo : genBillNo();
    const dateStr = isEdit
      ? String(_editOrder.date)
      : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const dispatchDateDisplay = formatDispatchRange(dispatchFromRaw, dispatchToRaw);

    document.getElementById('bNo').textContent = billNo;
    document.getElementById('bDate').textContent = dateStr;
    document.getElementById('bGeneratedBy').textContent = currentUser || '—';
    document.getElementById('bName').textContent = name;
    document.getElementById('bPhone').textContent = phone || '—';
    document.getElementById('bEmailRow').style.display = email ? 'block' : 'none';
    document.getElementById('bEmail').textContent = email;
    document.getElementById('bAddrRow').style.display = address ? 'block' : 'none';
    document.getElementById('bAddress').textContent = address;

    let rowsHtml = '';
    let lastCat = null;
    selected.forEach(p => {
      if (p.category !== lastCat) {
        rowsHtml += `<tr><td colspan="3" class="cat-header">${escapeHtml(p.category)}</td></tr>`;
        lastCat = p.category;
      }
      rowsHtml += `<tr><td>${escapeHtml(p.name)}</td><td class="r">${p.qty}</td><td class="r">₹${p.lineTotal.toLocaleString('en-IN')}</td></tr>`;
    });
    document.getElementById('billItemsBody').innerHTML = rowsHtml;

    if (deliveryCharges > 0) {
      document.getElementById('bDeliveryRow').style.display = 'flex';
      document.getElementById('bDeliveryAmt').textContent = deliveryCharges.toLocaleString('en-IN');
    } else {
      document.getElementById('bDeliveryRow').style.display = 'none';
    }
    if (discountAmount > 0) {
      document.getElementById('bDiscountRow').style.display = 'flex';
      document.getElementById('bDiscountPct').textContent = discountPercent;
      document.getElementById('bDiscountAmt').textContent = discountAmount.toLocaleString('en-IN');
    } else {
      document.getElementById('bDiscountRow').style.display = 'none';
    }
    document.getElementById('bGrandTotal').textContent = grandTotal.toLocaleString('en-IN');

    if (dispatchDateDisplay) {
      document.getElementById('bDispatchRow').style.display = 'block';
      document.getElementById('bDispatchDates').textContent = dispatchDateDisplay;
    } else {
      document.getElementById('bDispatchRow').style.display = 'none';
    }

    if (remarks) {
      document.getElementById('bRemarksBox').style.display = 'block';
      document.getElementById('bRemarksText').textContent = remarks;
    } else {
      document.getElementById('bRemarksBox').style.display = 'none';
    }

    generatePaymentQR(grandTotal, billNo);

    lastBillFilename = `CCK-${billNo}.png`;
    lastBillNo = billNo;
    lastShareToken = isEdit
      ? (_editOrder.shareToken || lastShareToken)
      : ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));

    openOverlay(document.getElementById('billOverlay'));
    document.getElementById('overlayActionsWrap').style.display = 'block';
    positionOverlayActions();

    if (isEdit) {
      updateOrderInSheet({
        billNo, name, phone, email, address,
        items: selected, totalItems, totalAmount: grandTotal,
        deliveryCharges, discount: discountAmount, dispatchDateDisplay, remarks,
        generatedBy: currentUser || '', mapLink, deliveryType
      });
    } else {
      logToSheet({
        billNo, dateStr, name, phone, email, address,
        items: selected, totalItems, totalAmount: grandTotal,
        deliveryCharges, discount: discountAmount, dispatchDateDisplay, remarks,
        generatedBy: currentUser || '',
        mapLink, deliveryType,
        shareToken: lastShareToken
      });
    }
    invalidateOrders();

    setStatus('', '');
  });

  document.getElementById('closeOverlay').addEventListener('click', () => {
    closeOverlay(document.getElementById('billOverlay'));
    document.getElementById('generateBtn').disabled = false;
  });

  document.getElementById('copyImageBtn').addEventListener('click', async () => {
    setStatus('Copying image...', '');
    try {
      const canvas = await renderBillToCanvas();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setStatus('Image copied to clipboard.', 'ok');
      } else {
        setStatus('Copy not supported on this browser — use Download instead.', '');
      }
    } catch (e) {
      setStatus('Could not copy image.', 'err');
    }
  });

  function _resetForm() {
    ['custName','custPhone','custEmail','custAddress','remarks','deliveryCharges','discountPercent','dispatchTo','mapLink']
      .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('dispatchFrom').value = todayISO();
    [['custName','nameError'],['custPhone','phoneError'],['custEmail','emailError']]
      .forEach(([i,e]) => setFieldError(i, e, ''));
    document.getElementById('deliveryType').value = 'Local';
    quantities = PRODUCTS.map(() => 0);
    renderProducts();
    updateTotals();
    setStatus('', '');
    _clearEditState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('newOrderBtn').addEventListener('click', () => {
    closeOverlay(document.getElementById('billOverlay'));
    document.getElementById('generateBtn').disabled = false;
    _resetForm();
  });

  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('generateBtn').disabled = false;
    _resetForm();
  });

  document.getElementById('downloadBtn').addEventListener('click', async () => {
    setStatus('Preparing image...', '');
    try {
      const canvas = await renderBillToCanvas();
      const link = document.createElement('a');
      link.download = lastBillFilename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setStatus('Image downloaded.', 'ok');
    } catch (e) {
      setStatus('Could not generate image.', 'err');
    }
  });

  document.getElementById('shareBtn').addEventListener('click', async () => {
    setStatus('Preparing image...', '');
    try {
      const canvas = await renderBillToCanvas();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], lastBillFilename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        const trackUrl = lastShareToken
          ? `${window.location.origin}/track?bill=${encodeURIComponent(lastBillNo)}&token=${encodeURIComponent(lastShareToken)}`
          : '';
        const shareText = trackUrl
          ? `Track your CozyCatKitchen order here:\n${trackUrl}`
          : 'Here is your order bill from CozyCatKitchen';
        await navigator.share({ files: [file], title: 'CozyCatKitchen Bill', text: shareText });
        setStatus('Shared successfully.', 'ok');
      } else {
        const link = document.createElement('a');
        link.download = lastBillFilename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        setStatus('Sharing not supported here — image downloaded instead.', '');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setStatus('Could not share image.', 'err');
    }
  });

  // Customer name autocomplete
  _initAutocomplete();

  // Initial render
  renderProducts();
  updateTotals();
}

function _initAutocomplete() {
  const nameInput = document.getElementById('custName');
  const suggestions = document.getElementById('custSuggestions');
  let focusedIdx = -1;

  function getMatches(q) {
    if (!q || !customersState.loaded) return [];
    const lq = q.toLowerCase();
    return customersState.cache.filter(c => String(c.name || '').toLowerCase().includes(lq)).slice(0, 6);
  }

  function render(matches) {
    if (!matches.length) { suggestions.style.display = 'none'; return; }
    focusedIdx = -1;
    suggestions.innerHTML = matches.map((c, i) => {
      const sub = [c.phone, c.address].filter(Boolean).join(' · ');
      return `<div class="autocomplete-item" data-idx="${i}">
        <div class="ac-name">${c.name}</div>
        ${sub ? `<div class="ac-sub">${sub}</div>` : ''}
      </div>`;
    }).join('');
    suggestions._matches = matches;
    suggestions.style.display = 'block';
  }

  function fill(c) {
    nameInput.value = c.name;
    if (c.phone) document.getElementById('custPhone').value = c.phone;
    if (c.email) document.getElementById('custEmail').value = c.email;
    if (c.address) document.getElementById('custAddress').value = c.address;
    suggestions.style.display = 'none';
    focusedIdx = -1;
  }

  function setFocus(idx) {
    const items = suggestions.querySelectorAll('.autocomplete-item');
    items.forEach(el => el.classList.remove('ac-focused'));
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('ac-focused');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
    focusedIdx = idx;
  }

  nameInput.addEventListener('input', () => render(getMatches(nameInput.value)));
  nameInput.addEventListener('keydown', e => {
    const items = suggestions.querySelectorAll('.autocomplete-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(Math.min(focusedIdx + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(Math.max(focusedIdx - 1, 0)); }
    else if (e.key === 'Enter' && focusedIdx >= 0) { e.preventDefault(); fill(suggestions._matches[focusedIdx]); }
    else if (e.key === 'Escape') { suggestions.style.display = 'none'; focusedIdx = -1; }
  });
  suggestions.addEventListener('mousedown', e => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    e.preventDefault();
    fill(suggestions._matches[parseInt(item.dataset.idx, 10)]);
  });
  document.addEventListener('click', e => {
    if (!nameInput.contains(e.target) && !suggestions.contains(e.target)) {
      suggestions.style.display = 'none';
    }
  });
}

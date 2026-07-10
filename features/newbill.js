/* New Bill feature — product list, bill generation, QR, sharing. */
import { PRODUCTS, UPI_ID, UPI_PAYEE_NAME } from '/core/config.js';
import { escapeHtml, setStatus } from '/core/dom.js';
import { _authToken, currentUser } from '/core/auth.js';
import { logToSheet, invalidateOrders } from '/core/api.js';
import { customersState } from '/core/state.js';

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
  let items = 0, amount = 0;
  PRODUCTS.forEach((p, i) => {
    items += quantities[i];
    amount += quantities[i] * p.price;
  });
  const deliveryCharges = parseFloat(document.getElementById('deliveryCharges').value) || 0;
  const discountAmount  = parseFloat(document.getElementById('discountAmount').value)  || 0;
  amount += deliveryCharges - discountAmount;
  document.getElementById('totalItems').textContent = items;
  document.getElementById('totalAmount').textContent = amount.toLocaleString('en-IN');
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

/* ---- Bill generation event handler ---- */

let lastBillFilename = 'CozyCatKitchen-Bill.png';
let lastBillNo = '';
let lastShareToken = '';

export function initNewBill() {
  document.getElementById('generateBtn').addEventListener('click', () => {
    document.getElementById('generateBtn').disabled = true;
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    const remarks = document.getElementById('remarks').value.trim();
    const deliveryCharges = parseFloat(document.getElementById('deliveryCharges').value) || 0;
    const discountAmount  = parseFloat(document.getElementById('discountAmount').value)  || 0;
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
    const grandTotal = productsTotal + deliveryCharges - discountAmount;
    const billNo = genBillNo();
    const dateStr = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
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
    lastShareToken = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    document.getElementById('billOverlay').classList.add('show');
    document.getElementById('overlayActionsWrap').style.display = 'block';
    positionOverlayActions();

    logToSheet({
      billNo, dateStr, name, phone, email, address,
      items: selected, totalItems, totalAmount: grandTotal,
      deliveryCharges, discount: discountAmount, dispatchDateDisplay, remarks,
      generatedBy: currentUser || '',
      mapLink, deliveryType,
      shareToken: lastShareToken
    });
    invalidateOrders();

    setStatus('', '');
  });

  document.getElementById('closeOverlay').addEventListener('click', () => {
    document.getElementById('billOverlay').classList.remove('show');
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

  document.getElementById('newOrderBtn').addEventListener('click', () => {
    document.getElementById('billOverlay').classList.remove('show');
    document.getElementById('generateBtn').disabled = false;
    ['custName','custPhone','custEmail','custAddress','remarks','deliveryCharges','discountAmount','dispatchFrom','dispatchTo','mapLink']
      .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('deliveryType').value = 'Local';
    quantities = PRODUCTS.map(() => 0);
    renderProducts();
    updateTotals();
    setStatus('', '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

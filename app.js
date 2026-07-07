/* Configuration (webhook URLs, UPI) and the shared fetchWithTimeout()
   helper live in config.js, which is loaded before this file. */

/* ============================================================
   Global error visibility
   ------------------------------------------------------------
   Silent failures (an unhandled rejection, or a backend request that
   never returns) are what made past bugs so hard to spot. A global
   handler logs them and shows a dismissible toast. (The companion
   fetchWithTimeout() helper is in config.js.)
   ============================================================ */
function showErrorToast(message, opts){
  opts = opts || {};
  let el = document.getElementById('globalErrorToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'globalErrorToast';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'max-width:90%;background:#b3261e;color:#fff;padding:12px 16px;border-radius:10px;' +
      'font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:9999;display:flex;' +
      'gap:12px;align-items:center;';
    const span = document.createElement('span');
    span.id = 'globalErrorToastMsg';
    const close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Dismiss');
    close.style.cssText = 'background:none;border:none;color:#fff;font-size:15px;cursor:pointer;line-height:1;';
    close.onclick = () => el.remove();
    el.appendChild(span);
    el.appendChild(close);
    document.body.appendChild(el);
  }
  document.getElementById('globalErrorToastMsg').textContent = message;
  clearTimeout(el._hideTimer);
  // Persistent toasts (e.g. "bill not saved") stay until the user dismisses them.
  if(!opts.persist){
    el._hideTimer = setTimeout(() => { if(el && el.parentNode) el.remove(); }, 8000);
  }
}

let _errorReportCount = 0;
function reportClientError(err, context){
  console.error('[CCK] Unhandled error' + (context ? ' (' + context + ')' : '') + ':', err);
  // Aborted fetches (timeouts) already surface their own inline message — don't double-report.
  if(err && err.name === 'AbortError') return;
  try { showErrorToast('Something went wrong. Please try again — details are in the console.'); } catch(_){}
  // Best-effort: record it server-side (ErrorLog sheet) so silent failures leave
  // a trail. GET so an older backend without this endpoint is a harmless no-op;
  // capped per page load and fully swallowed so logging can never loop or throw.
  try {
    if(SHEET_WEBHOOK_URL && _errorReportCount < 20){
      _errorReportCount++;
      const params = new URLSearchParams({
        action: 'clientError',
        message: ((err && (err.message || err)) || '').toString().slice(0, 300),
        context: (context || '').slice(0, 120),
        url: location.pathname,
        ua: (navigator.userAgent || '').slice(0, 200),
        user: currentUser || '',
        auth: _authToken || ''
      });
      fetchWithTimeout(`${SHEET_WEBHOOK_URL}?${params.toString()}`).catch(() => {});
    }
  } catch(_){ /* never let error reporting cause another error */ }
}

window.addEventListener('error', e => reportClientError(e.error || e.message, 'window.onerror'));
window.addEventListener('unhandledrejection', e => reportClientError(e.reason, 'unhandledrejection'));

/* ============================================================
   EDIT ZONE 2 — YOUR PRODUCT CATALOG
   Organized by category. Each category has a name and a list
   of products. To add/remove/edit products or categories,
   just edit this structure directly.
   ============================================================ */
const CATALOG = [
  {
    category: "Meals (70g)",
    items: [
      { name: "Nourish", price: 70 },
      { name: "Vitality", price: 70 },
      { name: "Power", price: 85 },
      { name: "Supreme", price: 85 },
      { name: "Nurture", price: 100 },
      { name: "Thrive", price: 100 }
    ]
  },
  {
    category: "Broths (100ml)",
    items: [
      { name: "Essence", price: 100 },
      { name: "Bone Rich", price: 100 }
    ]
  },
  {
    category: "Cozy Meals Combos",
    comboCategory: true,
    items: [
      { name: "Vitality",                 price24: 2330, price60: 4850 },
      { name: "Nourish",                  price24: 2330, price60: 4850 },
      { name: "Supreme",                  price24: 2690, price60: 5750 },
      { name: "Power",                    price24: 2690, price60: 5750 },
      { name: "Nurture",                  price24: 3050, price60: 6650 },
      { name: "Thrive",                   price24: 3050, price60: 6650 },
      { name: "Assorted (4 Each/10 Each)", name24: "Assorted (Pack of 24 / 4 Each)", name60: "Assorted (Pack of 60 / 10 Each)", price24: 2690, price60: 5750 }
    ]
  },
  {
    category: "Treats",
    items: [
      { name: "Cookies 100g", price: 120 },
      { name: "Cookies 200g", price: 200 },
      { name: "Happy Tummy Cupcake (pack of 2)", price: 300 },
      { name: "Purr-fect Protein Cupcake (pack of 2)", price: 300 },
      { name: "Veggie Mew Cupcake (pack of 2)", price: 350 },
      { name: "Tuna Delight Cupcake (pack of 2)", price: 400 },
      { name: "Fruity Paws Cupcake (pack of 2)", price: 400 },
      { name: "Golden Glow Cupcake (pack of 2)", price: 450 }
    ]
  }
];

/* ============================================================
   EDIT ZONE 3 — USERS (UI metadata only)
   Passwords are NO LONGER stored here. Authentication happens on the
   Google Apps Script backend (see the Users sheet + setupUser() there).
   This list only controls per-user UI: the landing tab and which tabs
   are shown. The real access boundary is the server-side token check —
   these `access` arrays are a convenience, not a security control.

   The `name` must match the username created via setupUser() on the
   backend. To add a user: run setupUser() on the backend, then add a
   matching entry here for their landing tab and visible tabs.
   ============================================================ */
const USERS = [
  { name: "Aditya",   landing: "dashboard", access: ["dashboard","newbill","orders","ingredients"] },
  { name: "Priyanka", landing: "newbill",   access: ["newbill","orders","dashboard"] },
];

/* ============================================================
   Fulfillment / Dispatch config
   ============================================================ */
const SENDER_NAME = "Cozy Cat Kitchen";
const SENDER_ADDRESS = "Jaypee Klassic, Sector 134, Noida 201304";
const BOXES = [
  { label: "Box 1 (35.5×30.5×26.5 cm)", dims: [35.5, 30.5, 26.5] },
  { label: "Box 2 (22×26×20 cm)",        dims: [22, 26, 20] },
];
const PRODUCT_WEIGHTS = {
  "Nourish": 70, "Vitality": 70, "Power": 70, "Supreme": 70, "Nurture": 70, "Thrive": 70,
  "Essence": 100, "Bone Rich": 100,
  "Cookies 100g": 100, "Cookies 200g": 200,
  "Happy Tummy Cupcake (pack of 2)": 100, "Purr-fect Protein Cupcake (pack of 2)": 100,
  "Veggie Mew Cupcake (pack of 2)": 100, "Tuna Delight Cupcake (pack of 2)": 100,
  "Fruity Paws Cupcake (pack of 2)": 100, "Golden Glow Cupcake (pack of 2)": 100,
  "Nourish (Pack of 24)": 1680, "Vitality (Pack of 24)": 1680, "Power (Pack of 24)": 1680,
  "Supreme (Pack of 24)": 1680, "Nurture (Pack of 24)": 1680, "Thrive (Pack of 24)": 1680,
  "Assorted (Pack of 24 / 4 Each)": 1680,
  "Nourish (Pack of 60)": 4200, "Vitality (Pack of 60)": 4200, "Power (Pack of 60)": 4200,
  "Supreme (Pack of 60)": 4200, "Nurture (Pack of 60)": 4200, "Thrive (Pack of 60)": 4200,
  "Assorted (Pack of 60 / 10 Each)": 4200,
};

// Flatten into a single list internally while remembering category boundaries.
// Combo items are expanded into two separate rows (Pack of 24 and Pack of 60).
const PRODUCTS = [];
CATALOG.forEach(cat => {
  cat.items.forEach(item => {
    if(cat.comboCategory){
      const n24 = item.name24 || `${item.name} (Pack of 24)`;
      const n60 = item.name60 || `${item.name} (Pack of 60)`;
      PRODUCTS.push({ name: n24, price: item.price24, category: cat.category });
      PRODUCTS.push({ name: n60, price: item.price60, category: cat.category });
    } else {
      PRODUCTS.push({ name: item.name, price: item.price, category: cat.category });
    }
  });
});

/* ============================================================
   App logic — no need to edit below this line
   ============================================================ */
let quantities = PRODUCTS.map(() => 0);

function renderProducts(){
  const container = document.getElementById('productList');
  let html = '';
  let lastCat = null;
  PRODUCTS.forEach((p, i) => {
    if(p.category !== lastCat){
      if(lastCat !== null) html += '</div>';
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
  if(lastCat !== null) html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.idx, 10);
      if(btn.dataset.action === 'inc'){
        quantities[i]++;
      } else {
        quantities[i] = Math.max(0, quantities[i] - 1);
      }
      renderProducts();
      updateTotals();
    });
  });

  container.querySelectorAll('input.qty').forEach(input => {
    // Select all text on focus so typing replaces the value instead of appending
    input.addEventListener('focus', () => input.select());

    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.idx, 10);
      let val = parseInt(input.value, 10);
      if(isNaN(val) || val < 0) val = 0;
      quantities[i] = val;
      renderProducts();
      updateTotals();
    });

    // Commit on Enter as well (mobile numeric keypads often have a "Done"/Enter key)
    input.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){
        input.blur();
      }
    });
  });
}

function updateTotals(){
  let items = 0, amount = 0;
  PRODUCTS.forEach((p, i) => {
    items += quantities[i];
    amount += quantities[i] * p.price;
  });
  const deliveryCharges = parseFloat(document.getElementById('deliveryCharges').value) || 0;
  amount += deliveryCharges;
  document.getElementById('totalItems').textContent = items;
  document.getElementById('totalAmount').textContent = amount.toLocaleString('en-IN');
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

function genBillNo(){
  const d = new Date();
  const rand = Math.random().toString(36).slice(2,5).toUpperCase();
  return 'CCK' + d.getFullYear().toString().slice(-2) +
    String(d.getMonth()+1).padStart(2,'0') +
    String(d.getDate()).padStart(2,'0') + '-' +
    String(d.getHours()).padStart(2,'0') +
    String(d.getMinutes()).padStart(2,'0') +
    String(d.getSeconds()).padStart(2,'0') + '-' + rand;
}

let lastBillFilename = 'CozyCatKitchen-Bill.png';
let lastBillNo = '';
let lastShareToken = '';

document.getElementById('generateBtn').addEventListener('click', () => {
  document.getElementById('generateBtn').disabled = true;
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const email = document.getElementById('custEmail').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const remarks = document.getElementById('remarks').value.trim();
  const deliveryCharges = parseFloat(document.getElementById('deliveryCharges').value) || 0;
  const dispatchFromRaw = document.getElementById('dispatchFrom').value;
  const dispatchToRaw = document.getElementById('dispatchTo').value;
  const mapLink = document.getElementById('mapLink').value.trim();
  const deliveryType = document.getElementById('deliveryType').value;

  const selected = [];
  PRODUCTS.forEach((p, i) => {
    if(quantities[i] > 0){
      selected.push({ name: p.name, qty: quantities[i], price: p.price, lineTotal: p.price * quantities[i], category: p.category });
    }
  });

  const _reEnableBtn = () => { document.getElementById('generateBtn').disabled = false; };

  if(!name){
    setStatus('Please enter customer name.', 'err');
    _reEnableBtn(); return;
  }
  if(phone && !/^\d{10}$/.test(phone.replace(/[\s\-]/g, ''))){
    setStatus('Phone number must be 10 digits.', 'err');
    _reEnableBtn(); return;
  }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    setStatus('Please enter a valid email address.', 'err');
    _reEnableBtn(); return;
  }
  if(selected.length === 0){
    setStatus('Please select at least one product.', 'err');
    _reEnableBtn(); return;
  }
  if(dispatchFromRaw && dispatchToRaw && dispatchToRaw < dispatchFromRaw){
    setStatus('Dispatch "To" date cannot be before "From" date.', 'err');
    _reEnableBtn(); return;
  }

  const totalItems = selected.reduce((s, p) => s + p.qty, 0);
  const productsTotal = selected.reduce((s, p) => s + p.lineTotal, 0);
  const grandTotal = productsTotal + deliveryCharges;
  const billNo = genBillNo();
  const dateStr = new Date().toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' });
  const dispatchDateDisplay = formatDispatchRange(dispatchFromRaw, dispatchToRaw);

  // Populate bill view
  document.getElementById('bNo').textContent = billNo;
  document.getElementById('bDate').textContent = dateStr;
  document.getElementById('bGeneratedBy').textContent = currentUser || '—';
  document.getElementById('bName').textContent = name;
  document.getElementById('bPhone').textContent = phone || '—';

  document.getElementById('bEmailRow').style.display = email ? 'block' : 'none';
  document.getElementById('bEmail').textContent = email;
  document.getElementById('bAddrRow').style.display = address ? 'block' : 'none';
  document.getElementById('bAddress').textContent = address;

  // Group selected items by category for the bill table
  let rowsHtml = '';
  let lastCat = null;
  selected.forEach(p => {
    if(p.category !== lastCat){
      rowsHtml += `<tr><td colspan="3" class="cat-header">${escapeHtml(p.category)}</td></tr>`;
      lastCat = p.category;
    }
    rowsHtml += `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td class="r">${p.qty}</td>
        <td class="r">₹${p.lineTotal.toLocaleString('en-IN')}</td>
      </tr>`;
  });
  document.getElementById('billItemsBody').innerHTML = rowsHtml;

  // Delivery charges row — only shown if a non-zero value was entered
  if(deliveryCharges > 0){
    document.getElementById('bDeliveryRow').style.display = 'flex';
    document.getElementById('bDeliveryAmt').textContent = deliveryCharges.toLocaleString('en-IN');
  } else {
    document.getElementById('bDeliveryRow').style.display = 'none';
  }

  document.getElementById('bGrandTotal').textContent = grandTotal.toLocaleString('en-IN');

  // Dispatch date row — only shown if at least one date was entered
  if(dispatchDateDisplay){
    document.getElementById('bDispatchRow').style.display = 'block';
    document.getElementById('bDispatchDates').textContent = dispatchDateDisplay;
  } else {
    document.getElementById('bDispatchRow').style.display = 'none';
  }

  if(remarks){
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

  // Log to Google Sheet (fire and forget, non-blocking)
  logToSheet({
    billNo, dateStr, name, phone, email, address,
    items: selected, totalItems, totalAmount: grandTotal,
    deliveryCharges, dispatchDateDisplay, remarks,
    generatedBy: currentUser || '',
    mapLink, deliveryType,
    shareToken: lastShareToken
  });
  invalidateOrders(); // a new bill was added — refetch so it appears in lists

  setStatus('', '');
});

function formatDispatchRange(fromRaw, toRaw){
  const fmt = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  };
  if(fromRaw && toRaw){
    if(fromRaw === toRaw) return fmt(fromRaw);
    return `${fmt(fromRaw)} - ${fmt(toRaw)}`;
  }
  if(fromRaw) return fmt(fromRaw);
  if(toRaw) return fmt(toRaw);
  return '';
}

function positionOverlayActions(){
  const overlay = document.getElementById('billOverlay');
  const wrap = document.getElementById('overlayActionsWrap');
  overlay.appendChild(wrap);
  wrap.style.position = 'sticky';
  wrap.style.bottom = '0';
  wrap.style.background = 'transparent';
  wrap.style.paddingTop = '6px';
  wrap.style.paddingBottom = '10px';
}

document.getElementById('closeOverlay').addEventListener('click', () => {
  document.getElementById('billOverlay').classList.remove('show');
  document.getElementById('generateBtn').disabled = false;
});

// Copy bill image to clipboard
document.getElementById('copyImageBtn').addEventListener('click', async () => {
  setStatus('Copying image...', '');
  try{
    const canvas = await renderBillToCanvas();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if(navigator.clipboard && navigator.clipboard.write){
      await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
      setStatus('Image copied to clipboard.', 'ok');
    } else {
      setStatus('Copy not supported on this browser — use Download instead.', '');
    }
  }catch(e){
    setStatus('Could not copy image.', 'err');
  }
});

// New Order — close overlay and reset the form
document.getElementById('newOrderBtn').addEventListener('click', () => {
  document.getElementById('billOverlay').classList.remove('show');
  document.getElementById('generateBtn').disabled = false;
  // Clear customer fields
  ['custName','custPhone','custEmail','custAddress','remarks','deliveryCharges','dispatchFrom','dispatchTo','mapLink']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('deliveryType').value = 'Local';
  // Reset quantities
  quantities = PRODUCTS.map(() => 0);
  renderProducts();
  updateTotals();
  setStatus('', '');
  // Scroll back to top
  window.scrollTo({top: 0, behavior: 'smooth'});
});

async function renderBillToCanvas(){
  const billCard = document.getElementById('billCard');
  return await html2canvas(billCard, { scale: 2, backgroundColor: '#ffffff' });
}

document.getElementById('downloadBtn').addEventListener('click', async () => {
  setStatus('Preparing image...', '');
  try{
    const canvas = await renderBillToCanvas();
    const link = document.createElement('a');
    link.download = lastBillFilename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setStatus('Image downloaded.', 'ok');
  }catch(e){
    setStatus('Could not generate image.', 'err');
  }
});

document.getElementById('shareBtn').addEventListener('click', async () => {
  setStatus('Preparing image...', '');
  try{
    const canvas = await renderBillToCanvas();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], lastBillFilename, { type: 'image/png' });

    if(navigator.canShare && navigator.canShare({ files: [file] })){
      const trackUrl = lastShareToken
        ? `${window.location.origin}/track?bill=${encodeURIComponent(lastBillNo)}&token=${encodeURIComponent(lastShareToken)}`
        : '';
      const shareText = trackUrl
        ? `Track your CozyCatKitchen order here:\n${trackUrl}`
        : 'Here is your order bill from CozyCatKitchen';
      await navigator.share({
        files: [file],
        title: 'CozyCatKitchen Bill',
        text: shareText
      });
      setStatus('Shared successfully.', 'ok');
    } else {
      const link = document.createElement('a');
      link.download = lastBillFilename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setStatus('Sharing not supported here — image downloaded instead.', '');
    }
  }catch(e){
    if(e.name !== 'AbortError'){
      setStatus('Could not share image.', 'err');
    }
  }
});

let qrInstance = null;

function generatePaymentQR(amount, billNo){
  const container = document.getElementById('qrContainer');
  container.innerHTML = ''; // clear any previous QR before redrawing

  if(!UPI_ID){
    document.getElementById('bPayBox').style.display = 'none';
    return;
  }
  document.getElementById('bPayBox').style.display = 'block';

  // Build a standard UPI deep link with the amount pre-filled.
  // tn (transaction note) carries the bill number for easier reconciliation.
  const formattedAmount = amount.toFixed(2);
  const upiUrl = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('Order ' + billNo)}`;

  qrInstance = new QRCode(container, {
    text: upiUrl,
    width: 128,
    height: 128,
    colorDark: "#1C1A17",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

function logToSheet(data){
  if(!SHEET_WEBHOOK_URL) return;
  const payload = {
    billNo: data.billNo,
    dateStr: data.dateStr,
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    remarks: data.remarks,
    totalItems: data.totalItems,
    totalAmount: data.totalAmount,
    deliveryCharges: data.deliveryCharges || 0,
    dispatchDate: data.dispatchDateDisplay || '',
    paymentStatus: 'Pending',
    itemsSummary: data.items.map(i => `${i.category}: ${i.name} x${i.qty} (₹${i.lineTotal})`).join('; '),
    generatedBy: data.generatedBy || '',
    mapLink: data.mapLink || '',
    deliveryType: data.deliveryType || '',
    shareToken: data.shareToken || '',
    auth: _authToken
  };
  // Readable POST (text/plain avoids a CORS preflight) so we can CONFIRM the
  // bill was actually saved. The old mode:'no-cors' hid every server-side
  // failure — including an expired-token rejection — so a bill could render
  // on screen and never reach the sheet with no warning at all.
  fetchWithTimeout(SHEET_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).then(res => res.json()).then(result => {
    if(result && result.status === 'success') return; // saved — nothing to do
    if(result && result.message === 'Unauthorized'){
      if(!tokenValid(_authToken)){
        // Genuinely expired — send them to log in and regenerate.
        forceRelogin();
        showErrorToast(
          `Bill ${data.billNo} was NOT saved — your session expired. Please sign in again and regenerate this bill.`,
          { persist: true });
      } else {
        // Token still valid — a transient backend rejection. Don't log them out.
        showErrorToast(
          `Bill ${data.billNo} may not have been saved (server was busy). Please check the orders sheet before dispatching.`,
          { persist: true });
      }
      return;
    }
    showErrorToast(
      `Bill ${data.billNo} may not have been saved (${(result && result.message) || 'unknown error'}). Please check the orders sheet before dispatching.`,
      { persist: true });
  }).catch(() => {
    showErrorToast(
      `Bill ${data.billNo} was NOT saved to the order log (network error). The bill is still on screen — check your connection and regenerate it.`,
      { persist: true });
  });
}

function setStatus(msg, type){
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

document.getElementById('deliveryCharges').addEventListener('input', updateTotals);

/* ============================================================
   Login / logout logic
   ============================================================ */
let currentUser = null;
let currentRole = null;
let _authToken = null;

function showLogin(){
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('headerUser').style.display = 'none';
}

function showApp(isRestore){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';
  document.getElementById('headerUser').style.display = 'flex';
  document.getElementById('userChip').textContent = currentUser;
  const userObj = USERS.find(u => u.name === currentUser);
  document.querySelectorAll('.tab-bar .tab').forEach(btn => {
    btn.style.display = (userObj && userObj.access.includes(btn.dataset.tab)) ? '' : 'none';
  });
  const landing = userObj ? userObj.landing : 'dashboard';
  if(isRestore){
    const tab = routeToTab(location.pathname);
    navigateTo((tab && userObj && userObj.access.includes(tab)) ? tab : landing, true);
  } else {
    navigateTo(landing, true);
  }
  prefetchOrders();
  prefetchCustomers();
  if(userObj && userObj.access.includes('ingredients')) loadIngMatrix();
}

/* ---- Session + token helpers ----
   The token is "<base64url(payload)>.<signature>". The client can read the
   payload (to know who's logged in and when it expires) but only the server
   can validate the signature — so this is UI convenience, never a security
   check. The real gate is the backend rejecting requests without a valid token. */
function b64urlToJson(s){
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while(s.length % 4) s += '=';
  return JSON.parse(atob(s));
}
function tokenPayload(token){
  try { return token ? b64urlToJson(String(token).split('.')[0]) : null; }
  catch(e){ return null; }
}
function tokenValid(token){
  const p = tokenPayload(token);
  return !!(p && p.exp && Date.now() < p.exp);
}
function authUrl(url){
  return url + (url.indexOf('?') > -1 ? '&' : '?') + 'auth=' + encodeURIComponent(_authToken || '');
}
function setSession(user, token){
  currentUser = user;
  _authToken = token;
  const p = tokenPayload(token);
  currentRole = p ? p.r : null;
  sessionStorage.setItem('cck_user', user);
  sessionStorage.setItem('cck_token', token);
}
function clearSession(){
  currentUser = null; _authToken = null; currentRole = null;
  sessionStorage.removeItem('cck_user');
  sessionStorage.removeItem('cck_token');
}
// Called when a request comes back Unauthorized (e.g. token expired mid-session).
function forceRelogin(){
  clearSession();
  showLogin();
  showErrorToast('Your session expired. Please sign in again.');
}

async function doLogin(){
  const uname = document.getElementById('loginUser').value.trim();
  const upass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  if(!uname || !upass){
    errEl.textContent = 'Enter your username and password.';
    return;
  }
  const btn = document.getElementById('loginBtn');
  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    // text/plain keeps this a CORS "simple request" (no preflight) so we can
    // read the response; POST keeps the password out of the URL and logs.
    const res = await fetchWithTimeout(SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', user: uname, pass: upass })
    });
    const data = await res.json();
    if(data.status === 'success' && data.token){
      setSession(data.user, data.token);
      errEl.textContent = '';
      document.getElementById('loginPass').value = '';
      showApp(false);
    } else {
      errEl.textContent = data.message || 'Incorrect username or password.';
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
    }
  } catch(e){
    errEl.textContent = 'Could not reach the server. Check your connection and try again.';
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPass').addEventListener('keydown', e => {
  if(e.key === 'Enter') doLogin();
});
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearSession();
  quantities = PRODUCTS.map(() => 0);
  renderProducts();
  updateTotals();
  showLogin();
});

// Copy the header logo src into the login card logo (avoids duplicating the base64)
document.getElementById('loginLogo').src = document.querySelector('.logo-img').src;

/* ============================================================
   Router + Tab switching
   ============================================================ */
const ROUTE_TO_TAB = { dashboard:'dashboard', ebill:'newbill', orders:'orders', ingredients:'ingredients' };
const TAB_TO_ROUTE = { dashboard:'dashboard', newbill:'ebill', orders:'orders', ingredients:'ingredients' };

function routeToTab(pathname){
  const seg = pathname.replace(/^\//, '').replace(/\/$/, '');
  return ROUTE_TO_TAB[seg] || null;
}

function showTab(tab){
  document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector('.tab-bar .tab[data-tab="' + tab + '"]');
  if(btn) btn.classList.add('active');
  const panel = document.getElementById('tab-' + tab);
  if(panel) panel.classList.add('active');
  if(tab === 'orders') loadOrders();
  if(tab === 'ingredients') loadIngredientTab();
  if(tab === 'dashboard') loadDashboard();
}

function navigateTo(tab, replace){
  const route = TAB_TO_ROUTE[tab] || tab;
  if(replace) history.replaceState({ tab }, '', '/' + route);
  else history.pushState({ tab }, '', '/' + route);
  showTab(tab);
}

window.addEventListener('popstate', e => {
  if(!currentUser) return;
  const tab = (e.state && e.state.tab) || routeToTab(location.pathname);
  if(tab) showTab(tab);
});

document.querySelectorAll('.tab-bar .tab').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
});

/* ============================================================
   Orders tab — history + mark as paid
   ============================================================ */
let _ordersLoaded = false;
let _ordersLoadPromise = null;
let _selectedBillNo = null;
let _ordersCache = [];
let _customersLoaded = false;
let _customersCache = [];

// Ingredient-tab state. Declared here (before the checkLogin IIFE that runs
// during initial script execution) so a refresh onto /ingredients doesn't hit
// a temporal dead zone: checkLogin → showApp → loadIngredientTab/loadIngMatrix
// reference these before their old declaration site further down the script.
let _ingMatrix = null;        // { productName: { ingredientName: perUnitQty } }
let _ingMatrixPromise = null;
let _ingIngredients = [];     // ordered ingredient list from matrix sheet
let _ingOrders = [];          // orders loaded for ingredient tab
let _ingSelected = new Set(); // selected bill numbers
let _ingCheckedIngs = {};     // { ingredientName: boolean } for buying checkboxes

function statusBadgeClass(s){
  if(!s) return '';
  const l = s.toLowerCase();
  if(l === 'paid') return 'paid';
  if(l === 'pending') return 'pending';
  return '';
}

function fulfillmentBadgeClass(s){
  if(!s) return '';
  const l = s.toLowerCase();
  if(l === 'packed') return 'packed';
  if(l === 'booked') return 'booked';
  if(l === 'picked up') return 'pickedup';
  if(l === 'dispatched') return 'dispatched'; // legacy orders (pre "Picked Up")
  if(l === 'delivered') return 'delivered';
  return '';
}

/* ============================================================
   Fulfillment / Dispatch
   ============================================================ */
let _fulfillmentOrder = null;

function calcOrderWeight(itemsSummary){
  const items = parseItemsSummary(itemsSummary || '');
  let totalG = 0;
  items.forEach(({name, qty}) => {
    const w = PRODUCT_WEIGHTS[name];
    if(w) totalG += w * qty;
  });
  return totalG; // grams
}

function calcVolumetricWeight(dims){
  return (dims[0] * dims[1] * dims[2]) / 5000; // kg
}

function generatePickupRequest(o, box, chargeWeightKg){
  const today = new Date();
  const shippingDate = today.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  const dimStr = box.dims.join('×') + ' cm';
  return `Pickup Request for CozyCatKitchen - \n\nOrder 1 - \n\nName - ${o.name}\nAddress - ${o.address}\nPH: ${o.phone}\nEmail - ${o.email || 'N/A'}\nWeight - ${chargeWeightKg.toFixed(2)} kg approx\nBox Size - ${dimStr}\nProduct Type - Cat Food\nAmount - ${o.totalAmount}\nSender's Name - ${SENDER_NAME}\nSender's Address - ${SENDER_ADDRESS}\nDelivery Type - Air Priority\nShipping Date - ${shippingDate}\n\nItems are frozen and packed with ice gel packs for temperature control. \nHandle with care. \nMake sure to deliver it within 24 hrs.\nLet me know if there are any delays.`;
}

function renderLocalDispatch(container, o){
  // geo: URI triggers Android's app chooser (Google Maps, Waze, Ola, Uber, etc.)
  const geoUri = `geo:0,0?q=${encodeURIComponent(o.address)}`;
  container.innerHTML = `
    <div class="dispatch-box">
      <div class="dispatch-box-label">Local Dispatch</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <button class="btn btn-secondary" id="copyForRapidoBtn">Copy Address for Rapido / Porter</button>
        <a href="${escapeHtml(geoUri)}" class="btn btn-secondary" style="text-align:center;text-decoration:none;display:block;box-sizing:border-box;">Navigate to Address</a>
        ${o.mapLink && o.mapLink.startsWith('http') ? `<a href="${escapeHtml(o.mapLink)}" class="btn btn-secondary" style="text-align:center;text-decoration:none;display:block;box-sizing:border-box;font-size:12px;">View on Google Maps</a>` : ''}
      </div>
    </div>
  `;
  document.getElementById('copyForRapidoBtn').addEventListener('click', () => {
    const text = `${o.name}\n${o.phone}\n${o.address}`;
    if(navigator.clipboard){
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyForRapidoBtn');
        if(btn){ btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Address for Rapido / Porter'; }, 2000); }
      }).catch(() => alert('Copy manually:\n\n' + text));
    } else {
      alert('Copy manually:\n\n' + text);
    }
  });
}

function renderNationalDispatch(container, o){
  const actualWeightG = calcOrderWeight(o.itemsSummary);

  container.innerHTML = `
    <div class="dispatch-box">
      <div class="dispatch-box-label">National Dispatch — Courier</div>
      <div class="field" style="margin-top:8px;margin-bottom:0;">
        <label style="font-size:12px;color:var(--muted);margin-bottom:5px;font-weight:600;display:block;">Box Size</label>
        <select id="boxSelect" style="width:100%;border:1px solid var(--line);background:var(--paper);border-radius:6px;padding:11px 12px;font-size:14px;color:var(--ink);font-family:inherit;">
          ${BOXES.map((b, i) => `<option value="${i}">${escapeHtml(b.label)}</option>`).join('')}
        </select>
      </div>
      <div class="dispatch-weight" id="dispatchWeightLabel"></div>
      <div class="dispatch-weight-sub" id="dispatchWeightSub"></div>
      <div class="dispatch-box-label" style="margin-top:4px;">Pickup Request</div>
      <div class="pickup-request-text" id="pickupRequestText"></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" id="copyPickupBtn" style="flex:1;">Copy</button>
        <button class="btn btn-primary" id="whatsappPickupBtn" style="flex:1;">WhatsApp</button>
      </div>
    </div>
  `;

  function updatePickup(){
    const boxIdx = parseInt(document.getElementById('boxSelect').value) || 0;
    const box = BOXES[boxIdx];
    const volKg = calcVolumetricWeight(box.dims);
    const actualKg = actualWeightG / 1000;
    const chargeKg = Math.max(actualKg, volKg);
    document.getElementById('dispatchWeightLabel').textContent = `Charge weight: ${chargeKg.toFixed(2)} kg`;
    document.getElementById('dispatchWeightSub').textContent = `Actual: ${actualKg.toFixed(2)} kg · Volumetric: ${volKg.toFixed(2)} kg`;
    document.getElementById('pickupRequestText').textContent = generatePickupRequest(o, box, chargeKg);
  }

  updatePickup();
  document.getElementById('boxSelect').addEventListener('change', updatePickup);

  document.getElementById('copyPickupBtn').addEventListener('click', () => {
    const text = document.getElementById('pickupRequestText').textContent;
    if(navigator.clipboard){
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyPickupBtn');
        if(btn){ btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
      }).catch(() => alert('Copy failed.'));
    } else {
      alert('Copy manually:\n\n' + text);
    }
  });

  document.getElementById('whatsappPickupBtn').addEventListener('click', () => {
    const text = document.getElementById('pickupRequestText').textContent;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  });
}

function updateFulfillmentUI(){
  const status = document.getElementById('fulfillmentSelect').value;
  // Tracking/consignment number can exist once the booking is made onward.
  const showTracking = status === 'Booked' || status === 'Picked Up' || status === 'Delivered';
  document.getElementById('trackingLinkField').style.display = showTracking ? 'block' : 'none';
  // The shipping-partner pickup request is generated when you BOOK the shipment
  // (this is the request to book a consignment — the package hasn't moved yet).
  const workflow = document.getElementById('dispatchWorkflow');
  if(status !== 'Booked' || !_fulfillmentOrder){
    workflow.innerHTML = '';
    return;
  }
  const deliveryType = (_fulfillmentOrder.deliveryType || 'Local').trim();
  if(deliveryType === 'National'){
    renderNationalDispatch(workflow, _fulfillmentOrder);
  } else {
    renderLocalDispatch(workflow, _fulfillmentOrder);
  }
}

function openFulfillmentPanel(billNo){
  _fulfillmentOrder = _ordersCache.find(x => String(x.billNo) === String(billNo));
  if(!_fulfillmentOrder) return;
  document.getElementById('fulfillmentBillLabel').textContent = billNo;
  const sel = document.getElementById('fulfillmentSelect');
  sel.value = _fulfillmentOrder.fulfillmentStatus || 'Packed';
  document.getElementById('trackingLinkInput').value = _fulfillmentOrder.trackingLink || '';
  updateFulfillmentUI();
  document.getElementById('fulfillmentPanel').style.display = 'block';
  document.getElementById('fulfillmentPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderOrders(orders){
  // Note: does NOT write _ordersCache — that's owned solely by getOrders().
  // (Previously this line let a search overwrite the cache with the filtered subset.)
  const el = document.getElementById('ordersList');
  if(!orders.length){
    el.innerHTML = '<div class="orders-empty">No orders found.</div>';
    return;
  }
  el.innerHTML = orders.map(o => `
    <div class="order-card" data-billno="${escapeHtml(o.billNo)}">
      <div class="order-card-top">
        <div>
          <div class="order-card-name">${escapeHtml(o.name)}</div>
          <div class="order-card-meta">${escapeHtml(o.billNo)} &middot; ${escapeHtml(String(o.date))}</div>
          ${o.phone ? `<div class="order-card-meta"><a href="tel:${escapeHtml(o.phone)}" onclick="event.stopPropagation()">${escapeHtml(o.phone)}</a></div>` : ''}
          ${o.generatedBy ? `<div class="order-card-meta">By: ${escapeHtml(o.generatedBy)}</div>` : ''}
        </div>
        <div class="order-card-amount">₹${Number(o.totalAmount).toLocaleString('en-IN')}</div>
      </div>
      <div class="order-card-bottom">
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
          <span class="status-badge ${statusBadgeClass(o.paymentStatus)}">${escapeHtml(o.paymentStatus||'—')}</span>
          ${o.fulfillmentStatus ? `<span class="fulfillment-badge ${fulfillmentBadgeClass(o.fulfillmentStatus)}">${escapeHtml(o.fulfillmentStatus)}</span>` : ''}
        </div>
        <button class="btn-mark" data-billno="${escapeHtml(o.billNo)}" data-status="${escapeHtml(o.paymentStatus||'Pending')}">Update Status</button>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.order-card').forEach(card => {
    card.addEventListener('click', () => openOrderDetail(card.dataset.billno));
  });
  el.querySelectorAll('.btn-mark').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openStatusPanel(btn.dataset.billno, btn.dataset.status);
    });
  });
}

function openOrderDetail(billNo){
  const o = _ordersCache.find(x => String(x.billNo) === String(billNo));
  if(!o) return;

  const phoneHtml = o.phone
    ? `<a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>` : '—';
  const emailHtml = o.email
    ? `<a href="mailto:${escapeHtml(o.email)}">${escapeHtml(o.email)}</a>` : '';
  const deliveryHtml = o.deliveryCharges && Number(o.deliveryCharges) > 0
    ? `<div class="detail-amount-row"><span>Delivery</span><span>₹${Number(o.deliveryCharges).toLocaleString('en-IN')}</span></div>` : '';
  const itemsHtml = o.itemsSummary && String(o.itemsSummary).trim()
    ? `<div class="detail-row"><div class="detail-label">Items</div><div class="detail-value">${escapeHtml(String(o.itemsSummary))}</div></div>` : '';
  const dispatchHtml = o.dispatchDate && String(o.dispatchDate).trim()
    ? `<div class="detail-row"><div class="detail-label">Dispatch Date</div><div class="detail-value">${escapeHtml(String(o.dispatchDate))}</div></div>` : '';
  const remarksHtml = o.remarks && String(o.remarks).trim()
    ? `<div class="detail-row"><div class="detail-label">Remarks</div><div class="detail-value">${escapeHtml(String(o.remarks))}</div></div>` : '';
  const extraSection = dispatchHtml || remarksHtml
    ? `<hr class="detail-divider">${dispatchHtml}${remarksHtml}` : '';

  document.getElementById('orderDetailContent').innerHTML = `
    <div style="font-size:12.5px;color:var(--muted);font-weight:600;margin-bottom:16px;">
      ${escapeHtml(o.billNo)} &middot; ${escapeHtml(String(o.date))}
    </div>
    <div class="detail-row">
      <div class="detail-label">Customer</div>
      <div class="detail-value">${escapeHtml(o.name)}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Phone</div>
      <div class="detail-value">${phoneHtml}</div>
    </div>
    ${o.email ? `<div class="detail-row"><div class="detail-label">Email</div><div class="detail-value">${emailHtml}</div></div>` : ''}
    ${o.address ? `<div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">${escapeHtml(String(o.address))}</div></div>` : ''}
    <hr class="detail-divider">
    ${itemsHtml}
    ${deliveryHtml}
    <div class="detail-grand">
      <span>Total</span><span class="amt">₹${Number(o.totalAmount).toLocaleString('en-IN')}</span>
    </div>
    ${extraSection}
    <hr class="detail-divider">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div>
        <div class="detail-label">Payment Status</div>
        <span class="status-badge ${statusBadgeClass(o.paymentStatus)}">${escapeHtml(o.paymentStatus||'—')}</span>
      </div>
      ${o.generatedBy ? `<div style="font-size:11.5px;color:var(--muted);font-weight:600;">By: ${escapeHtml(o.generatedBy)}</div>` : ''}
    </div>
    ${o.paymentProof && String(o.paymentProof).startsWith('https://') ? `<div class="detail-row"><div class="detail-label">Payment Proof</div><div class="detail-value"><a href="${escapeHtml(o.paymentProof)}" target="_blank" rel="noopener">View Screenshot &#x2197;</a></div></div>` : ''}
    <button class="btn btn-secondary" id="detailUpdateStatusBtn">Update Status</button>
    <hr class="detail-divider">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div>
        <div class="detail-label">Fulfillment</div>
        <span class="fulfillment-badge ${fulfillmentBadgeClass(o.fulfillmentStatus)}">${o.fulfillmentStatus ? escapeHtml(o.fulfillmentStatus) : 'Not set'}</span>
      </div>
      <button class="btn-mark" id="detailUpdateFulfillmentBtn">Update Fulfillment</button>
    </div>
    ${o.trackingLink && String(o.trackingLink).startsWith('http') ? `<div class="detail-row"><div class="detail-label">Tracking</div><div class="detail-value"><a href="${escapeHtml(String(o.trackingLink))}" target="_blank" rel="noopener">Track Order &#x2197;</a></div></div>` : ''}
    ${o.deliveryType ? `<div class="detail-row"><div class="detail-label">Delivery Type</div><div class="detail-value">${escapeHtml(String(o.deliveryType))}</div></div>` : ''}
    <hr class="detail-divider">
    <button class="btn btn-secondary" id="detailShareBillBtn">Share Bill</button>
  `;

  document.getElementById('detailUpdateStatusBtn').addEventListener('click', () => {
    closeOrderDetail();
    openStatusPanel(o.billNo, o.paymentStatus || 'Pending');
  });

  document.getElementById('detailUpdateFulfillmentBtn').addEventListener('click', () => {
    closeOrderDetail();
    openFulfillmentPanel(o.billNo);
  });

  document.getElementById('detailShareBillBtn').addEventListener('click', () => reshareOrderBill(o));

  document.getElementById('orderDetailOverlay').classList.add('show');
}

function closeOrderDetail(){
  document.getElementById('orderDetailOverlay').classList.remove('show');
}

/* Single source of truth for the orders list.
   - Dedupes concurrent callers (they share one in-flight request).
   - Caches the result; later callers resolve instantly.
   - Handles the auth token and Unauthorized -> re-login.
   Resolves to the orders array; rejects on network/backend failure so each
   caller can render its own error UI. This replaces three separate fetches
   (prefetch / orders tab / ingredients tab) that each cached and errored
   differently. */
const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getOrders(){
  if(_ordersLoaded) return Promise.resolve(_ordersCache);
  if(!SHEET_WEBHOOK_URL) return Promise.resolve([]);
  if(_ordersLoadPromise) return _ordersLoadPromise;
  _ordersLoadPromise = (async () => {
    try {
      _ordersCache = await fetchOrdersWithRetry();
      _ordersLoaded = true;
      return _ordersCache;
    } finally {
      // Clear the in-flight handle so a failed load can be retried.
      _ordersLoadPromise = null;
    }
  })();
  return _ordersLoadPromise;
}

// Google Apps Script spins the web app down when idle, so the first request
// after a lull ("cold start") can take 10-30s and occasionally comes back with
// a transient error. Give each attempt a generous timeout and retry with
// backoff, so a cold start recovers on its own instead of showing an empty
// dashboard that needs a manual refresh.
async function fetchOrdersWithRetry(){
  const backoffs = [1500, 4000]; // waits between the (up to) 3 attempts
  let lastErr;
  for(let attempt = 0; attempt <= backoffs.length; attempt++){
    try {
      const res = await fetchWithTimeout(authUrl(`${SHEET_WEBHOOK_URL}?action=orders&limit=200`), {}, 30000);
      const data = await res.json();
      if(data.message === 'Unauthorized'){
        // Only log out if the token has ACTUALLY expired. A backend that says
        // "unauthorized" while our token is still valid is a transient cold-start
        // hiccup — retry rather than nuking a good session and bouncing to login.
        if(!tokenValid(_authToken)){ forceRelogin(); throw new Error('Unauthorized'); }
        lastErr = new Error('Unauthorized (transient)');
      } else if(data.status === 'success'){
        return data.orders || [];
      } else {
        lastErr = new Error(data.message || 'Failed to load orders');
      }
    } catch(e){
      if(e.message === 'Unauthorized') throw e; // genuine expiry — stop, already handled
      lastErr = e; // network / timeout / parse error — retry
    }
    if(attempt < backoffs.length) await _sleep(backoffs[attempt]);
  }
  throw lastErr || new Error('Failed to load orders');
}

// Drop the cache so the next getOrders() refetches — call after any change
// that mutates order data on the server (status/fulfillment update, new bill).
function invalidateOrders(){
  _ordersLoaded = false;
  _ordersLoadPromise = null;
}

// Warm the cache in the background (called on login). Renders the dashboard if
// it's the active tab once data arrives; visible loaders show their own errors.
function prefetchOrders(){
  return getOrders().then(orders => {
    if(document.getElementById('tab-dashboard').classList.contains('active')){
      renderDashboard(orders);
    }
  }).catch(() => { /* silent — loadOrders/loadDashboard surface their own errors */ });
}

async function prefetchCustomers(){
  if(_customersLoaded || !SHEET_WEBHOOK_URL) return;
  try{
    const res = await fetchWithTimeout(authUrl(`${SHEET_WEBHOOK_URL}?action=customers`));
    const data = await res.json();
    if(data.status === 'success'){
      _customersCache = data.customers || [];
      _customersLoaded = true;
    }
  }catch(e){ /* silent */ }
}

/* ============================================================
   Customer name autocomplete
   ============================================================ */
(function(){
  const nameInput = document.getElementById('custName');
  const suggestions = document.getElementById('custSuggestions');
  let focusedIdx = -1;

  function getMatches(q){
    if(!q || !_customersLoaded) return [];
    const lq = q.toLowerCase();
    return _customersCache.filter(c => String(c.name||'').toLowerCase().includes(lq)).slice(0, 6);
  }

  function render(matches){
    if(!matches.length){ suggestions.style.display = 'none'; return; }
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

  function fill(c){
    nameInput.value = c.name;
    if(c.phone) document.getElementById('custPhone').value = c.phone;
    if(c.email) document.getElementById('custEmail').value = c.email;
    if(c.address) document.getElementById('custAddress').value = c.address;
    suggestions.style.display = 'none';
    focusedIdx = -1;
  }

  function setFocus(idx){
    const items = suggestions.querySelectorAll('.autocomplete-item');
    items.forEach(el => el.classList.remove('ac-focused'));
    if(idx >= 0 && idx < items.length){
      items[idx].classList.add('ac-focused');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
    focusedIdx = idx;
  }

  nameInput.addEventListener('input', () => render(getMatches(nameInput.value)));

  nameInput.addEventListener('keydown', e => {
    const items = suggestions.querySelectorAll('.autocomplete-item');
    if(e.key === 'ArrowDown'){ e.preventDefault(); setFocus(Math.min(focusedIdx + 1, items.length - 1)); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); setFocus(Math.max(focusedIdx - 1, 0)); }
    else if(e.key === 'Enter' && focusedIdx >= 0){ e.preventDefault(); fill(suggestions._matches[focusedIdx]); }
    else if(e.key === 'Escape'){ suggestions.style.display = 'none'; focusedIdx = -1; }
  });

  suggestions.addEventListener('mousedown', e => {
    const item = e.target.closest('.autocomplete-item');
    if(!item) return;
    e.preventDefault();
    fill(suggestions._matches[parseInt(item.dataset.idx, 10)]);
  });

  document.addEventListener('click', e => {
    if(!nameInput.contains(e.target) && !suggestions.contains(e.target)){
      suggestions.style.display = 'none';
    }
  });
})();

const _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseOrderMonth(dateStr){
  const s = String(dateStr||'').trim();
  if(!s) return null;
  // Primary: the "D MMM YYYY" text the app writes (e.g. "5 Jul 2026, 2:30 pm").
  // Tolerate a full month name too ("5 July 2026") and any letter case.
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
  if(m){
    const abbr = m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase();
    const mi = _MON.indexOf(abbr);
    if(mi !== -1) return { year: parseInt(m[3], 10), month: mi };
  }
  // Fallback: a value the browser can parse as a date — e.g. an ISO string if
  // Google Sheets stored the Date column as a real date ("2026-07-05T..."), or
  // "2026-07-05". Guarded so non-dates return null. This is what previously made
  // an affected month silently show ₹0 on the trend.
  const d = new Date(s);
  if(!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() };
  return null;
}

function parseItemsFull(summary){
  if(!summary) return [];
  return String(summary).split('; ').map(part => {
    const m = part.match(/^([^:]+):\s*(.+?)\s+x(\d+)\s+\(₹([\d,]+(?:\.\d+)?)\)/);
    if(!m) return null;
    return { category: m[1].trim(), name: m[2].trim(), qty: parseInt(m[3],10), lineTotal: parseFloat(m[4].replace(/,/g,'')) };
  }).filter(Boolean);
}

async function loadDashboard(){
  if(_ordersLoaded){
    renderDashboard(_ordersCache);
    return;
  }
  document.getElementById('dashLoading').style.display = 'block';
  document.getElementById('dashContent').style.display = 'none';
  try {
    renderDashboard(await getOrders());
  } catch(e){
    if(e.message === 'Unauthorized') return; // forceRelogin already handled it
    document.getElementById('dashLoading').textContent = 'Could not load dashboard. Check your connection.';
  }
}

function renderDashboard(orders){
  const total = orders.length;
  const paid = orders.filter(o => String(o.paymentStatus||'').toLowerCase() === 'paid');
  const revenue = paid.reduce((s, o) => s + (Number(o.totalAmount)||0), 0);
  const unpaid = orders.filter(o => {
    const s = String(o.paymentStatus||'').toLowerCase();
    return s !== 'paid' && s !== 'refunded' && s !== 'cancelled';
  }).length;

  document.getElementById('dashTotalOrders').textContent = total;
  document.getElementById('dashRevenue').textContent = '₹' + revenue.toLocaleString('en-IN');
  document.getElementById('dashPending').textContent = unpaid;

  // Payment breakdown
  const payGroups = {};
  orders.forEach(o => { const s = o.paymentStatus||'—'; payGroups[s] = (payGroups[s]||0)+1; });
  document.getElementById('dashPayBreakdown').innerHTML = Object.entries(payGroups)
    .sort((a,b) => b[1]-a[1])
    .map(([s,c]) => `<div class="dash-brow"><span>${escapeHtml(s)}</span><span class="cnt">${c}</span></div>`)
    .join('');

  // Fulfillment breakdown
  const fulGroups = {};
  orders.forEach(o => { const s = o.fulfillmentStatus && String(o.fulfillmentStatus).trim() ? String(o.fulfillmentStatus) : 'Not set'; fulGroups[s] = (fulGroups[s]||0)+1; });
  document.getElementById('dashFulBreakdown').innerHTML = Object.entries(fulGroups)
    .sort((a,b) => b[1]-a[1])
    .map(([s,c]) => `<div class="dash-brow"><span>${escapeHtml(s)}</span><span class="cnt">${c}</span></div>`)
    .join('');

  // Recent orders (already sorted newest first)
  document.getElementById('dashRecent').innerHTML = orders.slice(0,5).map(o => `
    <div class="dash-recent">
      <div class="dash-recent-left">
        <div class="dash-recent-name">${escapeHtml(o.name)}</div>
        <div class="dash-recent-meta">${escapeHtml(String(o.billNo))} &middot; <span class="status-badge ${statusBadgeClass(o.paymentStatus)}" style="font-size:10px;padding:2px 7px;">${escapeHtml(o.paymentStatus||'—')}</span></div>
      </div>
      <div class="dash-recent-amt">₹${Number(o.totalAmount||0).toLocaleString('en-IN')}</div>
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px;font-weight:600;">No orders yet.</div>';

  // ── Extra stat cards ─────────────────────────────────────────
  const avgOrder = paid.length ? Math.round(revenue / paid.length) : 0;
  document.getElementById('dashAvgOrder').textContent = '₹' + avgOrder.toLocaleString('en-IN');

  // ── Customer aggregation (used by multiple sections) ──────────
  const custMap = {};
  orders.forEach(o => {
    const n = String(o.name||'').trim(); if(!n) return;
    if(!custMap[n]) custMap[n] = { name:n, spend:0, count:0 };
    custMap[n].count++;
    if(String(o.paymentStatus||'').toLowerCase() === 'paid') custMap[n].spend += Number(o.totalAmount||0);
  });
  const allCusts = Object.values(custMap);
  const uniqueCount = allCusts.length;
  const repeatCount = allCusts.filter(c => c.count > 1).length;
  document.getElementById('dashUniqueCustomers').textContent = uniqueCount;
  document.getElementById('dashRepeatRate').textContent = uniqueCount ? Math.round(repeatCount/uniqueCount*100)+'%' : '—';

  // ── Monthly revenue trend (last 6 months) ────────────────────
  const now = new Date();
  const trendKeys = [];
  const trendData = {};
  for(let i = 5; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = d.getFullYear()+'-'+d.getMonth();
    const label = _MON[d.getMonth()]+" '"+String(d.getFullYear()).slice(2);
    trendKeys.push(key);
    trendData[key] = { label, revenue:0, count:0 };
  }
  orders.forEach(o => {
    const dm = parseOrderMonth(o.date); if(!dm) return;
    const key = dm.year+'-'+dm.month;
    if(!trendData[key]) return;
    trendData[key].count++;
    if(String(o.paymentStatus||'').toLowerCase() === 'paid') trendData[key].revenue += Number(o.totalAmount||0);
  });
  const maxRev = Math.max(...trendKeys.map(k => trendData[k].revenue), 1);
  document.getElementById('dashTrend').innerHTML = trendKeys.map(k => {
    const t = trendData[k];
    const pct = Math.round(t.revenue/maxRev*100);
    return `<div class="dash-trend-row">
      <span class="dash-trend-label">${t.label}</span>
      <div class="dash-trend-bar-wrap"><div class="dash-trend-bar" style="width:${pct}%"></div></div>
      <span class="dash-trend-val">₹${t.revenue.toLocaleString('en-IN')}</span>
    </div>`;
  }).join('');

  // ── Top customers ─────────────────────────────────────────────
  const topCusts = allCusts.sort((a,b) => b.spend-a.spend).slice(0,8);
  const noData = '<div class="dash-brow"><span style="color:var(--muted);font-size:13px;">No data yet</span></div>';
  document.getElementById('dashTopCustomers').innerHTML = topCusts.length
    ? topCusts.map(c => `<div class="dash-brow">
        <div><div>${escapeHtml(c.name)}</div><div class="dash-brow-sub">${c.count} order${c.count>1?'s':''}</div></div>
        <span class="cnt">₹${c.spend.toLocaleString('en-IN')}</span>
      </div>`).join('')
    : noData;

  // ── Item and category breakdown ───────────────────────────────
  const itemMap = {}, catMap = {};
  orders.forEach(o => {
    parseItemsFull(o.itemsSummary).forEach(({ category, name, qty, lineTotal }) => {
      if(!itemMap[name]) itemMap[name] = { name, qty:0, revenue:0 };
      itemMap[name].qty += qty; itemMap[name].revenue += lineTotal;
      if(!catMap[category]) catMap[category] = { category, revenue:0, qty:0 };
      catMap[category].revenue += lineTotal; catMap[category].qty += qty;
    });
  });
  const topItems = Object.values(itemMap).sort((a,b) => b.qty-a.qty).slice(0,8);
  document.getElementById('dashTopItems').innerHTML = topItems.length
    ? topItems.map(it => `<div class="dash-brow">
        <div><div>${escapeHtml(it.name)}</div><div class="dash-brow-sub">${it.qty} units ordered</div></div>
        <span class="cnt">₹${it.revenue.toLocaleString('en-IN')}</span>
      </div>`).join('')
    : noData;

  const totalCatRev = Object.values(catMap).reduce((s,c) => s+c.revenue, 0)||1;
  document.getElementById('dashCategories').innerHTML = Object.values(catMap).sort((a,b) => b.revenue-a.revenue).length
    ? Object.values(catMap).sort((a,b) => b.revenue-a.revenue).map(c =>
        `<div class="dash-brow"><span>${escapeHtml(c.category)}</span>
         <span class="cnt">${Math.round(c.revenue/totalCatRev*100)}% &middot; ₹${c.revenue.toLocaleString('en-IN')}</span></div>`
      ).join('')
    : noData;

  // ── Delivery type split ───────────────────────────────────────
  const delivMap = {};
  orders.forEach(o => { const t = String(o.deliveryType||'').trim()||'Unknown'; delivMap[t]=(delivMap[t]||0)+1; });
  document.getElementById('dashDelivery').innerHTML = Object.entries(delivMap).sort((a,b) => b[1]-a[1])
    .map(([t,c]) => `<div class="dash-brow"><span>${escapeHtml(t)}</span><span class="cnt">${c}</span></div>`).join('')
    || noData;

  document.getElementById('dashLoading').style.display = 'none';
  document.getElementById('dashContent').style.display = 'block';
}

async function reshareOrderBill(o){
  // Parse itemsSummary: "Category: Name x2 (₹300.00); ..."
  const items = [];
  if(o.itemsSummary){
    String(o.itemsSummary).split('; ').forEach(part => {
      const m = part.match(/^([^:]+):\s*(.+?)\s+x(\d+)\s+\(₹([\d,.]+)\)/);
      if(m){
        const qty = parseInt(m[3]);
        const lineTotal = parseFloat(String(m[4]).replace(/,/g, ''));
        items.push({ category: m[1].trim(), name: m[2].trim(), qty, lineTotal });
      }
    });
  }

  const deliveryCharges = Number(o.deliveryCharges) || 0;
  const grandTotal = Number(o.totalAmount) || 0;

  // Populate bill card elements
  document.getElementById('bNo').textContent = o.billNo;
  document.getElementById('bDate').textContent = String(o.date);
  document.getElementById('bGeneratedBy').textContent = o.generatedBy || '—';
  document.getElementById('bName').textContent = o.name;
  document.getElementById('bPhone').textContent = o.phone || '—';
  document.getElementById('bEmailRow').style.display = o.email ? 'block' : 'none';
  document.getElementById('bEmail').textContent = o.email || '';
  document.getElementById('bAddrRow').style.display = o.address ? 'block' : 'none';
  document.getElementById('bAddress').textContent = String(o.address || '');

  let rowsHtml = '', lastCat = null;
  items.forEach(p => {
    if(p.category !== lastCat){
      rowsHtml += `<tr><td colspan="3" class="cat-header">${escapeHtml(p.category)}</td></tr>`;
      lastCat = p.category;
    }
    rowsHtml += `<tr><td>${escapeHtml(p.name)}</td><td class="r">${p.qty}</td><td class="r">₹${p.lineTotal.toLocaleString('en-IN')}</td></tr>`;
  });
  document.getElementById('billItemsBody').innerHTML = rowsHtml;

  if(deliveryCharges > 0){
    document.getElementById('bDeliveryRow').style.display = 'flex';
    document.getElementById('bDeliveryAmt').textContent = deliveryCharges.toLocaleString('en-IN');
  } else {
    document.getElementById('bDeliveryRow').style.display = 'none';
  }
  document.getElementById('bGrandTotal').textContent = grandTotal.toLocaleString('en-IN');

  if(o.dispatchDate && String(o.dispatchDate).trim()){
    document.getElementById('bDispatchRow').style.display = 'block';
    document.getElementById('bDispatchDates').textContent = String(o.dispatchDate);
  } else {
    document.getElementById('bDispatchRow').style.display = 'none';
  }

  if(o.remarks && String(o.remarks).trim()){
    document.getElementById('bRemarksBox').style.display = 'block';
    document.getElementById('bRemarksText').textContent = String(o.remarks);
  } else {
    document.getElementById('bRemarksBox').style.display = 'none';
  }

  generatePaymentQR(grandTotal, o.billNo);

  // Show overlay for html2canvas (hide action buttons so they don't interfere)
  const overlay = document.getElementById('billOverlay');
  const actionsWrap = document.getElementById('overlayActionsWrap');
  actionsWrap.style.display = 'none';
  overlay.classList.add('show');

  try{
    const canvas = await renderBillToCanvas();
    overlay.classList.remove('show');
    actionsWrap.style.display = 'block';

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], `CCK-${o.billNo}.png`, { type: 'image/png' });

    const trackUrl = o.shareToken && String(o.shareToken).trim()
      ? `${window.location.origin}/track?bill=${encodeURIComponent(o.billNo)}&token=${encodeURIComponent(String(o.shareToken))}`
      : '';
    const shareText = trackUrl
      ? `Track your CozyCatKitchen order here:\n${trackUrl}`
      : 'Here is your order bill from CozyCatKitchen';

    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: 'CozyCatKitchen Bill', text: shareText });
    } else {
      const link = document.createElement('a');
      link.download = `CCK-${o.billNo}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  }catch(e){
    overlay.classList.remove('show');
    actionsWrap.style.display = 'block';
    if(e.name !== 'AbortError') alert('Could not share: ' + e.message);
  }
}

async function loadOrders(search){
  if(!SHEET_WEBHOOK_URL){
    document.getElementById('ordersList').innerHTML = '<div class="orders-empty">Sheet logging is not configured.</div>';
    return;
  }
  // Only show the spinner for a genuine fetch — a cache hit renders instantly.
  if(!_ordersLoaded){
    document.getElementById('ordersList').innerHTML = '<div class="orders-loading">Loading…</div>';
  }
  let orders;
  try {
    orders = await getOrders();
  } catch(e){
    if(e.message === 'Unauthorized') return; // forceRelogin already handled it
    document.getElementById('ordersList').innerHTML = '<div class="orders-empty">Could not load orders. Check your connection.</div>';
    return;
  }
  if(search){
    const s = search.toLowerCase();
    orders = orders.filter(o =>
      String(o.billNo).toLowerCase().includes(s) || String(o.name).toLowerCase().includes(s));
  }
  renderOrders(orders);
}

function toggleProofSection(status){
  const show = status === 'Paid';
  document.getElementById('proofSection').style.display = show ? 'block' : 'none';
}

function openStatusPanel(billNo, currentStatus){
  _selectedBillNo = billNo;
  document.getElementById('updateBillNoLabel').textContent = billNo;
  const sel = document.getElementById('statusSelect');
  sel.value = currentStatus || 'Pending';
  document.getElementById('proofFileInput').value = '';
  document.getElementById('proofFileName').textContent = '';
  toggleProofSection(sel.value);
  document.getElementById('statusUpdatePanel').style.display = 'block';
  document.getElementById('statusUpdatePanel').scrollIntoView({behavior:'smooth', block:'nearest'});
}

document.getElementById('statusSelect').addEventListener('change', () => {
  toggleProofSection(document.getElementById('statusSelect').value);
});

document.getElementById('proofFileInput').addEventListener('change', () => {
  const f = document.getElementById('proofFileInput').files[0];
  document.getElementById('proofFileName').textContent = f ? f.name : '';
});

document.getElementById('cancelStatusBtn').addEventListener('click', () => {
  document.getElementById('statusUpdatePanel').style.display = 'none';
  document.getElementById('proofFileInput').value = '';
  document.getElementById('proofFileName').textContent = '';
  _selectedBillNo = null;
});

document.getElementById('confirmStatusBtn').addEventListener('click', async () => {
  if(!_selectedBillNo) return;
  const status = document.getElementById('statusSelect').value;
  const btn = document.getElementById('confirmStatusBtn');
  const proofFile = document.getElementById('proofFileInput').files[0] || null;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try{
    const url = `${SHEET_WEBHOOK_URL}?action=updateStatus&billNo=${encodeURIComponent(_selectedBillNo)}&status=${encodeURIComponent(status)}`;
    const res = await fetchWithTimeout(authUrl(url));
    const data = await res.json();
    if(data.status === 'success'){
      if(proofFile) uploadPaymentProof(_selectedBillNo, proofFile);
      document.getElementById('statusUpdatePanel').style.display = 'none';
      document.getElementById('proofFileInput').value = '';
      document.getElementById('proofFileName').textContent = '';
      _selectedBillNo = null;
      invalidateOrders(); // status changed on the server — refetch fresh data
      loadOrders(document.getElementById('orderSearch').value.trim());
    } else {
      alert('Error: ' + (data.message || 'Could not update status.'));
    }
  }catch(e){
    alert('Network error — could not update status.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});

function uploadPaymentProof(billNo, file){
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    fetchWithTimeout(SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({
        action: 'uploadProof',
        billNo: billNo,
        imageBase64: base64,
        mimeType: file.type || 'image/jpeg',
        auth: _authToken
      })
    }).catch(() => {});
  };
  reader.readAsDataURL(file);
}

document.getElementById('closeOrderDetailBtn').addEventListener('click', closeOrderDetail);
document.getElementById('orderDetailOverlay').addEventListener('click', e => {
  if(e.target === document.getElementById('orderDetailOverlay')) closeOrderDetail();
});

document.getElementById('fulfillmentSelect').addEventListener('change', updateFulfillmentUI);

document.getElementById('cancelFulfillmentBtn').addEventListener('click', () => {
  document.getElementById('fulfillmentPanel').style.display = 'none';
  document.getElementById('dispatchWorkflow').innerHTML = '';
  _fulfillmentOrder = null;
});

document.getElementById('confirmFulfillmentBtn').addEventListener('click', async () => {
  if(!_fulfillmentOrder) return;
  const status = document.getElementById('fulfillmentSelect').value;
  const trackingLink = document.getElementById('trackingLinkInput').value.trim();
  const btn = document.getElementById('confirmFulfillmentBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try{
    const url = `${SHEET_WEBHOOK_URL}?action=updateFulfillment&billNo=${encodeURIComponent(_fulfillmentOrder.billNo)}&fulfillmentStatus=${encodeURIComponent(status)}&trackingLink=${encodeURIComponent(trackingLink)}`;
    const res = await fetchWithTimeout(authUrl(url));
    const data = await res.json();
    if(data.status === 'success'){
      document.getElementById('fulfillmentPanel').style.display = 'none';
      document.getElementById('dispatchWorkflow').innerHTML = '';
      _fulfillmentOrder = null;
      invalidateOrders(); // fulfillment changed on the server — refetch fresh data
      loadOrders(document.getElementById('orderSearch').value.trim());
    } else {
      alert('Error: ' + (data.message || 'Could not update fulfillment.'));
    }
  }catch(e){
    alert('Network error — could not update fulfillment.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});

let _searchTimer = null;
document.getElementById('orderSearch').addEventListener('input', () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    loadOrders(document.getElementById('orderSearch').value.trim());
  }, 400);
});

// Check if already logged in (survives page refresh within same browser tab session).
// Requires a still-valid session token, not just a saved username.
(function checkLogin(){
  const savedUser = sessionStorage.getItem('cck_user');
  const savedToken = sessionStorage.getItem('cck_token');
  if(savedUser && savedToken && tokenValid(savedToken) && USERS.find(u => u.name === savedUser)){
    setSession(savedUser, savedToken);
    showApp(true);
  } else {
    clearSession();
    showLogin();
  }
})();


/* ============================================================
   Ingredient Calculator tab
   ============================================================ */

// Maps bill product names → matrix product name(s) + multiplier
const BILL_TO_INGREDIENT = {
  // Meals (70g) — direct mapping
  "Nourish":    [{ product: "Nourish", mult: 1 }],
  "Vitality":   [{ product: "Vitality", mult: 1 }],
  "Power":      [{ product: "Power", mult: 1 }],
  "Supreme":    [{ product: "Supreme", mult: 1 }],
  "Nurture":    [{ product: "Nurture", mult: 1 }],
  "Thrive":     [{ product: "Thrive", mult: 1 }],
  // Broths (100ml)
  "Essence":    [{ product: "Essence", mult: 1 }],
  "Bone Rich":  [{ product: "Bone Rich", mult: 1 }],
  // Treats
  "Cookies 100g":  [{ product: "Cookies Chicken", mult: 1 }],
  "Cookies 200g":  [{ product: "Cookies Chicken", mult: 2 }],
  // All cupcake variants share one "Cupcake" recipe in the matrix; 1 pack of 2 = 1 recipe unit
  "Happy Tummy Cupcake (pack of 2)":          [{ product: "Cupcake", mult: 1 }],
  "Purr-fect Protein Cupcake (pack of 2)":    [{ product: "Cupcake", mult: 1 }],
  "Veggie Mew Cupcake (pack of 2)":           [{ product: "Cupcake", mult: 1 }],
  "Tuna Delight Cupcake (pack of 2)":         [{ product: "Cupcake", mult: 1 }],
  "Fruity Paws Cupcake (pack of 2)":          [{ product: "Cupcake", mult: 1 }],
  "Golden Glow Cupcake (pack of 2)":          [{ product: "Cupcake", mult: 1 }],
  // Combos (Pack of 24) — 24 individual meals
  "Nourish (Pack of 24)":   [{ product: "Nourish", mult: 24 }],
  "Vitality (Pack of 24)":  [{ product: "Vitality", mult: 24 }],
  "Power (Pack of 24)":     [{ product: "Power", mult: 24 }],
  "Supreme (Pack of 24)":   [{ product: "Supreme", mult: 24 }],
  "Nurture (Pack of 24)":   [{ product: "Nurture", mult: 24 }],
  "Thrive (Pack of 24)":    [{ product: "Thrive", mult: 24 }],
  // Assorted pack of 24 = 4 each of 6 meals
  "Assorted (Pack of 24 / 4 Each)": [
    { product: "Nourish",  mult: 4 },
    { product: "Vitality", mult: 4 },
    { product: "Power",    mult: 4 },
    { product: "Supreme",  mult: 4 },
    { product: "Nurture",  mult: 4 },
    { product: "Thrive",   mult: 4 }
  ],
  // Combos (Pack of 60) — 60 individual meals
  "Nourish (Pack of 60)":   [{ product: "Nourish", mult: 60 }],
  "Vitality (Pack of 60)":  [{ product: "Vitality", mult: 60 }],
  "Power (Pack of 60)":     [{ product: "Power", mult: 60 }],
  "Supreme (Pack of 60)":   [{ product: "Supreme", mult: 60 }],
  "Nurture (Pack of 60)":   [{ product: "Nurture", mult: 60 }],
  "Thrive (Pack of 60)":    [{ product: "Thrive", mult: 60 }],
  // Assorted pack of 60 = 10 each of 6 meals
  "Assorted (Pack of 60 / 10 Each)": [
    { product: "Nourish",  mult: 10 },
    { product: "Vitality", mult: 10 },
    { product: "Power",    mult: 10 },
    { product: "Supreme",  mult: 10 },
    { product: "Nurture",  mult: 10 },
    { product: "Thrive",   mult: 10 }
  ]
};

// State — _ing* variables are declared earlier (above the checkLogin IIFE)
// to avoid a temporal-dead-zone error on refresh onto /ingredients.

function parseItemsSummary(summary){
  if(!summary) return [];
  return summary.split('; ').map(part => {
    const m = part.match(/^[^:]+:\s*(.+?)\s+x(\d+)\s+\(₹/);
    if(!m) return null;
    return { name: m[1].trim(), qty: parseInt(m[2], 10) };
  }).filter(Boolean);
}

function expandBillItems(items){
  // Returns array of { product, qty } after mapping through BILL_TO_INGREDIENT
  const result = [];
  items.forEach(({ name, qty }) => {
    const mappings = BILL_TO_INGREDIENT[name];
    if(!mappings) return;
    mappings.forEach(({ product, mult }) => {
      result.push({ product, qty: qty * mult });
    });
  });
  return result;
}

function computeIngTotals(selectedBillNos){
  // Aggregate ingredient totals across selected orders
  const totals = {};
  _ingOrders.forEach(order => {
    if(!selectedBillNos.has(order.billNo)) return;
    const items = parseItemsSummary(order.itemsSummary);
    const expanded = expandBillItems(items);
    expanded.forEach(({ product, qty }) => {
      const ingMap = _ingMatrix[product];
      if(!ingMap) return;
      Object.entries(ingMap).forEach(([ing, perUnit]) => {
        totals[ing] = (totals[ing] || 0) + perUnit * qty;
      });
    });
  });
  return totals;
}

function getSelectedProductTotals(){
  // Returns { productName: totalQty } for making sub-tab radio list
  const prod = {};
  _ingOrders.forEach(order => {
    if(!_ingSelected.has(order.billNo)) return;
    const items = parseItemsSummary(order.itemsSummary);
    const expanded = expandBillItems(items);
    expanded.forEach(({ product, qty }) => {
      if(_ingMatrix[product]) prod[product] = (prod[product] || 0) + qty;
    });
  });
  return prod;
}

function loadIngMatrix(){
  if(_ingMatrix) return Promise.resolve();
  if(_ingMatrixPromise) return _ingMatrixPromise;
  _ingMatrixPromise = (async () => {
    if(!INGREDIENTS_WEBHOOK_URL){
      _ingMatrix = {};
      _ingIngredients = [];
      return;
    }
    try {
      const res = await fetchWithTimeout(authUrl(`${INGREDIENTS_WEBHOOK_URL}?action=matrix`), {}, 10000);
      const data = await res.json();
      if(data.status === 'success'){
        _ingMatrix = data.matrix;
        _ingIngredients = data.ingredients;
      } else {
        _ingMatrix = {};
      }
    } catch(e){
      _ingMatrix = {};
    }
  })();
  return _ingMatrixPromise;
}

async function loadIngOrders(){
  const packed = new Set(['Packed', 'Booked', 'Picked Up', 'Dispatched', 'Delivered']);
  if(!_ordersLoaded){
    document.getElementById('ingOrdersList').innerHTML = '<div class="orders-loading">Loading orders…</div>';
  }
  let allOrders;
  try {
    allOrders = await getOrders();
  } catch(e){
    if(e.message === 'Unauthorized') return; // forceRelogin already handled it
    document.getElementById('ingOrdersList').innerHTML = '<div class="orders-loading">Failed to load orders.</div>';
    return;
  }
  _ingOrders = allOrders.filter(o =>
    o.paymentStatus === 'Paid' && !packed.has(String(o.fulfillmentStatus || '').trim())
  );
  // Sort by dispatch date ascending (soonest first), then by bill number
  _ingOrders.sort((a, b) => {
    const da = a.dispatchDate || '';
    const db = b.dispatchDate || '';
    if(da !== db) return da < db ? -1 : 1;
    return String(a.billNo || '').localeCompare(String(b.billNo || ''));
  });
  renderIngOrders();
}

function renderIngOrders(){
  const el = document.getElementById('ingOrdersList');
  if(!_ingOrders.length){
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
      if(e.target.tagName === 'INPUT') return;
      const bill = card.dataset.bill;
      toggleIngSelection(bill);
    });
    const cb = card.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => toggleIngSelection(card.dataset.bill));
  });
}

function toggleIngSelection(billNo){
  if(_ingSelected.has(billNo)) _ingSelected.delete(billNo);
  else _ingSelected.add(billNo);
  renderIngOrders();
  updateIngCalcPanel();
}

function updateIngCalcPanel(){
  const count = _ingSelected.size;
  const bar = document.getElementById('ingSelectedBar');
  const panel = document.getElementById('ingCalcPanel');
  if(count === 0){
    bar.style.display = 'none';
    panel.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  document.getElementById('ingSelectedCount').textContent = `${count} order${count !== 1 ? 's' : ''} selected`;
  panel.style.display = 'block';

  // Refresh active sub-tab
  const activeSubTab = document.querySelector('.ing-sub-tab.active');
  const itab = activeSubTab ? activeSubTab.dataset.itab : 'buying';
  if(itab === 'buying') renderIngBuying();
  else renderIngMaking();
}

function renderIngBuying(){
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

function renderIngMaking(){
  const prodTotals = getSelectedProductTotals();
  const radios = document.getElementById('ingMakingRadios');
  const products = Object.entries(prodTotals);
  if(!products.length){
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
  // Show first product by default
  showMakingIngredients(products[0][0], products[0][1]);
}

function showMakingIngredients(product, totalQty){
  const resultEl = document.getElementById('ingMakingResult');
  const titleEl = document.getElementById('ingMakingProductTitle');
  const listEl = document.getElementById('ingMakingIngList');
  const ingMap = _ingMatrix[product];
  if(!ingMap){
    resultEl.style.display = 'none';
    return;
  }
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

async function loadIngredientTab(){
  // Start the matrix fetch in parallel — don't block order rendering on it
  const matrixPromise = loadIngMatrix();
  if(!_ingOrders.length) await loadIngOrders();
  else renderIngOrders();
  // Wait for matrix before updating the calc panel (needs ingredient data)
  await matrixPromise;
  updateIngCalcPanel();
}

// Ingredient sub-tab switching
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

// Clear selected orders
document.getElementById('ingClearBtn').addEventListener('click', () => {
  _ingSelected.clear();
  renderIngOrders();
  updateIngCalcPanel();
});

// WhatsApp share button
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
  if(!lines.length){ alert('No ingredients selected.'); return; }
  const orderNos = [..._ingSelected].join(', ');
  const text = `*CCK Ingredient List*\nOrders: ${orderNos}\n\n${lines.join('\n')}`;
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
});

renderProducts();
updateTotals();

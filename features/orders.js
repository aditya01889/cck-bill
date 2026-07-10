/* Orders tab — list, detail view, status/fulfillment updates, reshare. */
import { SHEET_WEBHOOK_URL, BOXES, PRODUCT_WEIGHTS, SENDER_NAME, SENDER_ADDRESS, fetchWithTimeout } from '/core/config.js';
import { escapeHtml } from '/core/dom.js';
import { _authToken, authUrl } from '/core/auth.js';
import { getOrders, invalidateOrders, uploadPaymentProof, parseItemsSummary } from '/core/api.js';
import { ordersState } from '/core/state.js';
import { renderBillToCanvas, generatePaymentQR } from '/features/newbill.js';

/* ---- State ---- */
let _selectedBillNo = null;
let _fulfillmentOrder = null;
let _filterPayment = '';
let _filterFulfillment = '';

/* ---- Helpers ---- */

function parseDispatchDate(str) {
  if (!str || !String(str).trim()) return null;
  const part = String(str).split(/\s*[-–]\s/)[0].trim();
  const d = new Date(part);
  return isNaN(d.getTime()) ? null : d;
}

function applyFilters(orders, search) {
  let result = orders;
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(o =>
      String(o.billNo).toLowerCase().includes(s) || String(o.name).toLowerCase().includes(s));
  }
  if (_filterPayment) {
    result = result.filter(o => (o.paymentStatus || '') === _filterPayment);
  }
  if (_filterFulfillment === '__none__') {
    result = result.filter(o => !o.fulfillmentStatus || !String(o.fulfillmentStatus).trim());
  } else if (_filterFulfillment) {
    result = result.filter(o => (o.fulfillmentStatus || '') === _filterFulfillment);
  }
  return result;
}

function renderDispatchView(orders) {
  const el = document.getElementById('dispatchView');
  if (!el) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 7);
  const lookback = new Date(today); lookback.setDate(lookback.getDate() - 3);

  const upcoming = orders.filter(o => {
    if ((o.fulfillmentStatus || '').toLowerCase() === 'delivered') return false;
    const d = parseDispatchDate(o.dispatchDate);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    return d >= lookback && d <= cutoff;
  });

  if (!upcoming.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="dispatch-queue">
      <div class="dispatch-queue-header">Dispatch Queue <span class="dispatch-queue-count">${upcoming.length}</span></div>
      ${upcoming.map(o => `
        <div class="dispatch-queue-row" data-billno="${escapeHtml(o.billNo)}">
          <div>
            <div class="dispatch-queue-name">${escapeHtml(o.name)}</div>
            <div class="dispatch-queue-date">${escapeHtml(String(o.dispatchDate))}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${o.fulfillmentStatus ? `<span class="fulfillment-badge ${fulfillmentBadgeClass(o.fulfillmentStatus)}">${escapeHtml(o.fulfillmentStatus)}</span>` : ''}
            <span style="font-size:13px;font-weight:800;color:var(--rust-deep);">₹${Number(o.totalAmount).toLocaleString('en-IN')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  el.querySelectorAll('.dispatch-queue-row').forEach(row => {
    row.addEventListener('click', () => openOrderDetail(row.dataset.billno));
  });
}

function statusBadgeClass(s) {
  if (!s) return '';
  const l = s.toLowerCase();
  if (l === 'paid') return 'paid';
  if (l === 'pending') return 'pending';
  return '';
}

function fulfillmentBadgeClass(s) {
  if (!s) return '';
  const l = s.toLowerCase();
  if (l === 'packed') return 'packed';
  if (l === 'booked') return 'booked';
  if (l === 'picked up') return 'pickedup';
  if (l === 'dispatched') return 'dispatched';
  if (l === 'delivered') return 'delivered';
  return '';
}

/* ---- Fulfillment / Dispatch helpers ---- */

function calcOrderWeight(itemsSummary) {
  const items = parseItemsSummary(itemsSummary || '');
  let totalG = 0;
  items.forEach(({ name, qty }) => {
    const w = PRODUCT_WEIGHTS[name];
    if (w) totalG += w * qty;
  });
  return totalG;
}

function calcVolumetricWeight(dims) {
  return (dims[0] * dims[1] * dims[2]) / 5000;
}

function generatePickupRequest(o, box, chargeWeightKg) {
  const today = new Date();
  const shippingDate = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const dimStr = box.dims.join('×') + ' cm';
  return `Pickup Request for CozyCatKitchen - \n\nOrder 1 - \n\nName - ${o.name}\nAddress - ${o.address}\nPH: ${o.phone}\nEmail - ${o.email || 'N/A'}\nWeight - ${chargeWeightKg.toFixed(2)} kg approx\nBox Size - ${dimStr}\nProduct Type - Cat Food\nAmount - ${o.totalAmount}\nSender's Name - ${SENDER_NAME}\nSender's Address - ${SENDER_ADDRESS}\nDelivery Type - Air Priority\nShipping Date - ${shippingDate}\n\nItems are frozen and packed with ice gel packs for temperature control. \nHandle with care. \nMake sure to deliver it within 24 hrs.\nLet me know if there are any delays.`;
}

function renderLocalDispatch(container, o) {
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
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyForRapidoBtn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Address for Rapido / Porter'; }, 2000); }
      }).catch(() => alert('Copy manually:\n\n' + text));
    } else {
      alert('Copy manually:\n\n' + text);
    }
  });
}

function renderNationalDispatch(container, o) {
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

  function updatePickup() {
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
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyPickupBtn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
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

function updateFulfillmentUI() {
  const status = document.getElementById('fulfillmentSelect').value;
  const showTracking = status === 'Booked' || status === 'Picked Up' || status === 'Delivered';
  document.getElementById('trackingLinkField').style.display = showTracking ? 'block' : 'none';
  const workflow = document.getElementById('dispatchWorkflow');
  if (status !== 'Booked' || !_fulfillmentOrder) {
    workflow.innerHTML = '';
    return;
  }
  const deliveryType = (_fulfillmentOrder.deliveryType || 'Local').trim();
  if (deliveryType === 'National') {
    renderNationalDispatch(workflow, _fulfillmentOrder);
  } else {
    renderLocalDispatch(workflow, _fulfillmentOrder);
  }
}

function openFulfillmentPanel(billNo) {
  _fulfillmentOrder = ordersState.cache.find(x => String(x.billNo) === String(billNo));
  if (!_fulfillmentOrder) return;
  document.getElementById('fulfillmentBillLabel').textContent = billNo;
  const sel = document.getElementById('fulfillmentSelect');
  sel.value = _fulfillmentOrder.fulfillmentStatus || 'Packed';
  document.getElementById('trackingLinkInput').value = _fulfillmentOrder.trackingLink || '';
  updateFulfillmentUI();
  document.getElementById('fulfillmentPanel').style.display = 'block';
  document.getElementById('fulfillmentPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---- Order list rendering ---- */

function renderOrders(orders) {
  const el = document.getElementById('ordersList');
  if (!orders.length) {
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
          <span class="status-badge ${statusBadgeClass(o.paymentStatus)}">${escapeHtml(o.paymentStatus || '—')}</span>
          ${o.fulfillmentStatus ? `<span class="fulfillment-badge ${fulfillmentBadgeClass(o.fulfillmentStatus)}">${escapeHtml(o.fulfillmentStatus)}</span>` : ''}
        </div>
        <button class="btn-mark" data-billno="${escapeHtml(o.billNo)}" data-status="${escapeHtml(o.paymentStatus || 'Pending')}">Update Status</button>
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

function openOrderDetail(billNo) {
  const o = ordersState.cache.find(x => String(x.billNo) === String(billNo));
  if (!o) return;

  const phoneHtml = o.phone ? `<a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>` : '—';
  const emailHtml = o.email ? `<a href="mailto:${escapeHtml(o.email)}">${escapeHtml(o.email)}</a>` : '';
  const deliveryHtml = o.deliveryCharges && Number(o.deliveryCharges) > 0
    ? `<div class="detail-amount-row"><span>Delivery</span><span>₹${Number(o.deliveryCharges).toLocaleString('en-IN')}</span></div>` : '';
  const discountHtml = o.discount && Number(o.discount) > 0
    ? `<div class="detail-amount-row"><span>Discount</span><span>−₹${Number(o.discount).toLocaleString('en-IN')}</span></div>` : '';
  const itemsHtml = o.itemsSummary && String(o.itemsSummary).trim()
    ? `<div class="detail-row"><div class="detail-label">Items</div><div class="detail-value">${escapeHtml(String(o.itemsSummary))}</div></div>` : '';
  const dispatchHtml = o.dispatchDate && String(o.dispatchDate).trim()
    ? `<div class="detail-row"><div class="detail-label">Dispatch Date</div><div class="detail-value">${escapeHtml(String(o.dispatchDate))}</div></div>` : '';
  const remarksHtml = o.remarks && String(o.remarks).trim()
    ? `<div class="detail-row"><div class="detail-label">Remarks</div><div class="detail-value">${escapeHtml(String(o.remarks))}</div></div>` : '';
  const extraSection = dispatchHtml || remarksHtml ? `<hr class="detail-divider">${dispatchHtml}${remarksHtml}` : '';

  document.getElementById('orderDetailContent').innerHTML = `
    <div style="font-size:12.5px;color:var(--muted);font-weight:600;margin-bottom:16px;">
      ${escapeHtml(o.billNo)} &middot; ${escapeHtml(String(o.date))}
    </div>
    <div class="detail-row"><div class="detail-label">Customer</div><div class="detail-value">${escapeHtml(o.name)}</div></div>
    <div class="detail-row"><div class="detail-label">Phone</div><div class="detail-value">${phoneHtml}</div></div>
    ${o.email ? `<div class="detail-row"><div class="detail-label">Email</div><div class="detail-value">${emailHtml}</div></div>` : ''}
    ${o.address ? `<div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">${escapeHtml(String(o.address))}</div></div>` : ''}
    <hr class="detail-divider">
    ${itemsHtml}
    ${deliveryHtml}
    ${discountHtml}
    <div class="detail-grand"><span>Total</span><span class="amt">₹${Number(o.totalAmount).toLocaleString('en-IN')}</span></div>
    ${extraSection}
    <hr class="detail-divider">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div>
        <div class="detail-label">Payment Status</div>
        <span class="status-badge ${statusBadgeClass(o.paymentStatus)}">${escapeHtml(o.paymentStatus || '—')}</span>
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

function closeOrderDetail() {
  document.getElementById('orderDetailOverlay').classList.remove('show');
}

export function openStatusPanel(billNo, currentStatus) {
  _selectedBillNo = billNo;
  document.getElementById('updateBillNoLabel').textContent = billNo;
  const sel = document.getElementById('statusSelect');
  sel.value = currentStatus || 'Pending';
  document.getElementById('proofFileInput').value = '';
  document.getElementById('proofFileName').textContent = '';
  _toggleProofSection(sel.value);
  document.getElementById('statusUpdatePanel').style.display = 'block';
  document.getElementById('statusUpdatePanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _toggleProofSection(status) {
  document.getElementById('proofSection').style.display = status === 'Paid' ? 'block' : 'none';
}

/* ---- Reshare bill from orders ---- */

async function reshareOrderBill(o) {
  const items = [];
  if (o.itemsSummary) {
    String(o.itemsSummary).split('; ').forEach(part => {
      const m = part.match(/^([^:]+):\s*(.+?)\s+x(\d+)\s+\(₹([\d,.]+)\)/);
      if (m) {
        const qty = parseInt(m[3]);
        const lineTotal = parseFloat(String(m[4]).replace(/,/g, ''));
        items.push({ category: m[1].trim(), name: m[2].trim(), qty, lineTotal });
      }
    });
  }

  const deliveryCharges = Number(o.deliveryCharges) || 0;
  const discountAmount = Number(o.discount) || 0;
  const grandTotal = Number(o.totalAmount) || 0;

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

  if (o.dispatchDate && String(o.dispatchDate).trim()) {
    document.getElementById('bDispatchRow').style.display = 'block';
    document.getElementById('bDispatchDates').textContent = String(o.dispatchDate);
  } else {
    document.getElementById('bDispatchRow').style.display = 'none';
  }

  if (o.remarks && String(o.remarks).trim()) {
    document.getElementById('bRemarksBox').style.display = 'block';
    document.getElementById('bRemarksText').textContent = String(o.remarks);
  } else {
    document.getElementById('bRemarksBox').style.display = 'none';
  }

  generatePaymentQR(grandTotal, o.billNo);

  const overlay = document.getElementById('billOverlay');
  const actionsWrap = document.getElementById('overlayActionsWrap');
  actionsWrap.style.display = 'none';
  overlay.classList.add('show');

  try {
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

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'CozyCatKitchen Bill', text: shareText });
    } else {
      const link = document.createElement('a');
      link.download = `CCK-${o.billNo}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  } catch (e) {
    overlay.classList.remove('show');
    actionsWrap.style.display = 'block';
    if (e.name !== 'AbortError') alert('Could not share: ' + e.message);
  }
}

/* ---- Main tab loading function ---- */

export async function loadOrders(search) {
  if (!SHEET_WEBHOOK_URL) {
    document.getElementById('ordersList').innerHTML = '<div class="orders-empty">Sheet logging is not configured.</div>';
    return;
  }
  if (!ordersState.loaded) {
    document.getElementById('ordersList').innerHTML = '<div class="orders-loading">Loading…</div>';
  }
  let orders;
  try {
    orders = await getOrders();
  } catch (e) {
    if (e.message === 'Unauthorized') return;
    document.getElementById('ordersList').innerHTML = '<div class="orders-empty">Could not load orders. Check your connection.</div>';
    return;
  }
  renderDispatchView(orders);
  renderOrders(applyFilters(orders, search));
}

/* ---- Wire event handlers (called once from main.js) ---- */

export function initOrders() {
  document.getElementById('statusSelect').addEventListener('change', () => {
    _toggleProofSection(document.getElementById('statusSelect').value);
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
    if (!_selectedBillNo) return;
    const status = document.getElementById('statusSelect').value;
    const btn = document.getElementById('confirmStatusBtn');
    const proofFile = document.getElementById('proofFileInput').files[0] || null;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const url = `${SHEET_WEBHOOK_URL}?action=updateStatus&billNo=${encodeURIComponent(_selectedBillNo)}&status=${encodeURIComponent(status)}`;
      const res = await fetchWithTimeout(authUrl(url));
      const data = await res.json();
      if (data.status === 'success') {
        if (proofFile) uploadPaymentProof(_selectedBillNo, proofFile);
        document.getElementById('statusUpdatePanel').style.display = 'none';
        document.getElementById('proofFileInput').value = '';
        document.getElementById('proofFileName').textContent = '';
        _selectedBillNo = null;
        invalidateOrders();
        loadOrders(document.getElementById('orderSearch').value.trim());
      } else {
        alert('Error: ' + (data.message || 'Could not update status.'));
      }
    } catch (e) {
      alert('Network error — could not update status.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  document.getElementById('cancelFulfillmentBtn').addEventListener('click', () => {
    document.getElementById('fulfillmentPanel').style.display = 'none';
    document.getElementById('dispatchWorkflow').innerHTML = '';
    _fulfillmentOrder = null;
  });

  document.getElementById('fulfillmentSelect').addEventListener('change', updateFulfillmentUI);

  document.getElementById('confirmFulfillmentBtn').addEventListener('click', async () => {
    if (!_fulfillmentOrder) return;
    const status = document.getElementById('fulfillmentSelect').value;
    const trackingLink = document.getElementById('trackingLinkInput').value.trim();
    const btn = document.getElementById('confirmFulfillmentBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const url = `${SHEET_WEBHOOK_URL}?action=updateFulfillment&billNo=${encodeURIComponent(_fulfillmentOrder.billNo)}&fulfillmentStatus=${encodeURIComponent(status)}&trackingLink=${encodeURIComponent(trackingLink)}`;
      const res = await fetchWithTimeout(authUrl(url));
      const data = await res.json();
      if (data.status === 'success') {
        document.getElementById('fulfillmentPanel').style.display = 'none';
        document.getElementById('dispatchWorkflow').innerHTML = '';
        _fulfillmentOrder = null;
        invalidateOrders();
        loadOrders(document.getElementById('orderSearch').value.trim());
      } else {
        alert('Error: ' + (data.message || 'Could not update fulfillment.'));
      }
    } catch (e) {
      alert('Network error — could not update fulfillment.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  document.getElementById('closeOrderDetailBtn').addEventListener('click', closeOrderDetail);
  document.getElementById('orderDetailOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('orderDetailOverlay')) closeOrderDetail();
  });

  let _searchTimer = null;
  document.getElementById('orderSearch').addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const search = document.getElementById('orderSearch').value.trim();
      if (ordersState.cache.length) {
        renderOrders(applyFilters(ordersState.cache, search));
      } else {
        loadOrders(search);
      }
    }, 400);
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.filter;
      document.querySelectorAll(`.filter-chip[data-filter="${group}"]`).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (group === 'payment') _filterPayment = chip.dataset.value;
      else if (group === 'fulfillment') _filterFulfillment = chip.dataset.value;
      if (ordersState.cache.length) {
        renderOrders(applyFilters(ordersState.cache, document.getElementById('orderSearch').value.trim()));
      }
    });
  });
}

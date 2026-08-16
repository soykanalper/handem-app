// ---------------------------------------------------------------------------
// screens-forms.js — every create/edit bottom-sheet form + delete actions +
// the customer/vendor/campaign quick-add flows. All functions here are
// exposed on window.H by app.js so generated HTML can call them directly
// via onclick attributes.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import * as calc from './calc.js';
import { fmt, fmtN, todayISO, addDays, escapeHtml, jsAttr, toast, confirmAction, uid } from './util.js';
import { openSheet, closeSheet, navigate, refresh, openLightbox, noteFieldHtml } from './ui.js';
import { pickPhoto } from './photo.js';
import { chequeStatusChip, photoStripHtml, photoGalleryHtml } from './components.js';
import { icon } from './icons.js';

const MAX_PHOTOS = 3;
let formPhotos = []; // transient dataURL[] held while a tahsilat/ödeme sub-form is open

function datalist(id, options) {
  return `<datalist id="${id}">${options.map((o) => `<option value="${escapeHtml(o)}">`).join('')}</datalist>`;
}

// ============================================================================
// CUSTOMER (Müşteri)
// ============================================================================
export async function openCustomerForm(clientId) {
  const client = clientId ? await repo.getClient(clientId) : null;
  const feeType = client ? (client.agencyFeeType || 'none') : 'none';
  const feeValue = client ? (client.agencyFeeValue || '') : '';

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${client ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}</h2>
    <div class="field"><label>Müşteri Adı *</label><input id="fClientName" placeholder="Örn: Altınkılıç" value="${client ? escapeHtml(client.name) : ''}"></div>

    <div class="fee-box">
      <div class="field" style="margin-bottom:8px;"><label>Varsayılan Ajans Ücreti</label>
        <select id="fFeeType">
          <option value="none" ${feeType === 'none' ? 'selected' : ''}>Yok</option>
          <option value="percent" ${feeType === 'percent' ? 'selected' : ''}>Yüzde (%)</option>
          <option value="fixed" ${feeType === 'fixed' ? 'selected' : ''}>Sabit Tutar (₺)</option>
        </select>
      </div>
      <div class="field" id="fFeeValueWrap" style="display:${feeType === 'none' ? 'none' : 'block'};margin-bottom:0;">
        <label id="fFeeValueLabel">${feeType === 'fixed' ? 'Tutar (₺)' : 'Yüzde (%)'}</label>
        <input id="fFeeValue" type="number" step="0.01" value="${feeValue}">
      </div>
      <p class="hint" style="margin-top:8px;">Yeni kampanya oluştururken bu değer otomatik önerilir, kampanya bazında değiştirilebilir.</p>
    </div>

    <button class="btn primary" onclick="H.saveCustomer('${client ? client.id : ''}')">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    sheet.querySelector('#fFeeType').addEventListener('change', (e) => {
      const wrap = sheet.querySelector('#fFeeValueWrap');
      const label = sheet.querySelector('#fFeeValueLabel');
      wrap.style.display = e.target.value === 'none' ? 'none' : 'block';
      label.textContent = e.target.value === 'fixed' ? 'Tutar (₺)' : 'Yüzde (%)';
    });
    sheet.querySelector('#fClientName').focus();
  });
}

export async function saveCustomer(clientId) {
  const name = document.getElementById('fClientName').value.trim();
  if (!name) { toast('Müşteri adı zorunlu', 'error'); return; }
  const feeType = document.getElementById('fFeeType').value;
  const feeValue = Number(document.getElementById('fFeeValue').value) || 0;
  const data = { name, agencyFeeType: feeType, agencyFeeValue: feeType === 'none' ? 0 : feeValue };
  try {
    if (clientId) {
      await repo.updateClient(clientId, data);
      toast('Müşteri güncellendi', 'success');
    } else {
      const c = await repo.createClient(data);
      toast('Müşteri eklendi', 'success');
    }
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteCustomer(clientId) {
  if (!confirmAction('Bu müşteriyi silmek istiyor musun? Finansal geçmiş saklanır.')) return;
  await repo.cascadeDeleteClient(clientId);
  toast('Müşteri silindi', 'success');
  navigate('/customers');
}

// ============================================================================
// ÜRÜN (Product)
// ============================================================================
export async function openProductForm(clientId, productId) {
  const product = productId ? await repo.getProduct(productId) : null;
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${product ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h2>
    <div class="field"><label>Ürün Adı *</label><input id="fProductName" placeholder="Örn: Kefirx" value="${product ? escapeHtml(product.name) : ''}"></div>
    <button class="btn primary" onclick="H.saveProduct('${clientId}','${product ? product.id : ''}')">Kaydet</button>
  `;
  openSheet(html, (sheet) => sheet.querySelector('#fProductName').focus());
}

export async function saveProduct(clientId, productId) {
  const name = document.getElementById('fProductName').value.trim();
  if (!name) { toast('Ürün adı zorunlu', 'error'); return; }
  try {
    if (productId) {
      await repo.updateProduct(productId, { name });
      toast('Ürün güncellendi', 'success');
    } else {
      await repo.createProduct({ name, clientId });
      toast('Ürün eklendi', 'success');
    }
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteProduct(productId, clientId) {
  if (!confirmAction('Bu ürünü silmek istiyor musun? Finansal geçmiş saklanır.')) return;
  await repo.cascadeDeleteProduct(productId);
  toast('Ürün silindi', 'success');
  navigate('/customers/' + clientId);
}

// ============================================================================
// KAMPANYA (Campaign)
// ============================================================================
export async function openCampaignForm(clientId, productId, campaignId) {
  const [client, product, campaign] = await Promise.all([
    repo.getClient(clientId), repo.getProduct(productId),
    campaignId ? repo.getCampaign(campaignId) : null
  ]);

  const feeType = campaign ? (campaign.agencyFeeType || 'none') : (client && client.agencyFeeType ? client.agencyFeeType : 'none');
  const feeValue = campaign ? (campaign.agencyFeeValue || '') : (client ? (client.agencyFeeValue || '') : '');
  const feeVatRate = campaign && campaign.agencyFeeVatRate != null ? String(campaign.agencyFeeVatRate) : '';

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${campaign ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}</h2>
    <div class="field"><label>Kampanya Adı</label><input id="fCampName" placeholder="${product ? escapeHtml(product.name) : 'Ürün adı kullanılır'}" value="${campaign && campaign.name ? escapeHtml(campaign.name) : ''}"></div>
    <div class="row2">
      <div class="field"><label>Başlangıç *</label><input id="fCampStart" type="date" value="${campaign ? campaign.startDate : ''}"></div>
      <div class="field"><label>Bitiş *</label><input id="fCampEnd" type="date" value="${campaign ? campaign.endDate : ''}"></div>
    </div>
    <div class="field">${noteFieldHtml('fCampNote', campaign && campaign.note ? campaign.note : '')}</div>

    <div class="fee-box">
      <div class="field" style="margin-bottom:8px;"><label>Ajans Ücreti</label>
        <select id="fCampFeeType">
          <option value="none" ${feeType === 'none' ? 'selected' : ''}>Yok</option>
          <option value="percent" ${feeType === 'percent' ? 'selected' : ''}>Yüzde (%) — toplam satış üzerinden</option>
          <option value="fixed" ${feeType === 'fixed' ? 'selected' : ''}>Sabit Tutar (₺)</option>
        </select>
      </div>
      <div class="row2" id="fCampFeeValueWrap" style="display:${feeType === 'none' ? 'none' : 'grid'};margin-bottom:0;">
        <div class="field" style="margin-bottom:0;">
          <label id="fCampFeeValueLabel">${feeType === 'fixed' ? 'Tutar (₺)' : 'Yüzde (%)'}</label>
          <input id="fCampFeeValue" type="number" step="0.01" value="${feeValue}">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>KDV</label>
          <select id="fCampFeeVat">
            ${calc.VAT_RATES.map((r) => `<option value="${r.value}" ${feeVatRate === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <button class="btn primary" onclick="H.saveCampaign('${clientId}','${productId}','${campaign ? campaign.id : ''}')">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    sheet.querySelector('#fCampFeeType').addEventListener('change', (e) => {
      const wrap = sheet.querySelector('#fCampFeeValueWrap');
      const label = sheet.querySelector('#fCampFeeValueLabel');
      wrap.style.display = e.target.value === 'none' ? 'none' : 'grid';
      label.textContent = e.target.value === 'fixed' ? 'Tutar (₺)' : 'Yüzde (%)';
    });
  });
}

export async function saveCampaign(clientId, productId, campaignId) {
  const name = document.getElementById('fCampName').value.trim();
  const startDate = document.getElementById('fCampStart').value;
  const endDate = document.getElementById('fCampEnd').value;
  const note = document.getElementById('fCampNote').value.trim();
  const feeType = document.getElementById('fCampFeeType').value;
  const feeValue = Number(document.getElementById('fCampFeeValue').value) || 0;
  const feeVatRaw = document.getElementById('fCampFeeVat').value;
  const feeVatRate = feeVatRaw === '' ? null : Number(feeVatRaw);

  if (!startDate || !endDate) { toast('Başlangıç ve bitiş tarihi zorunlu', 'error'); return; }
  if (endDate < startDate) { toast('Bitiş tarihi başlangıçtan önce olamaz', 'error'); return; }

  const [client, product] = await Promise.all([repo.getClient(clientId), repo.getProduct(productId)]);
  const data = {
    clientId, productId,
    clientName: client ? client.name : '',
    productName: product ? product.name : '',
    name: name || '',
    startDate, endDate, note,
    agencyFeeType: feeType, agencyFeeValue: feeType === 'none' ? 0 : feeValue,
    agencyFeeVatRate: feeType === 'none' ? null : feeVatRate
  };
  try {
    if (campaignId) {
      await repo.updateCampaign(campaignId, data);
      toast('Kampanya güncellendi', 'success');
    } else {
      await repo.createCampaign(data);
      toast('Kampanya eklendi', 'success');
    }
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteCampaign(campaignId, clientId, productId) {
  if (!confirmAction('Bu kampanyayı silmek istiyor musun? Finansal geçmiş saklanır.')) return;
  await repo.cascadeDeleteCampaign(campaignId);
  toast('Kampanya silindi', 'success');
  navigate('/customers/' + clientId + '/products/' + productId);
}

// ============================================================================
// MECRA / YÜKLENİCİ KAYDI (CampaignMedia)
// ============================================================================
export async function openMediaForm(campaignId, mediaId) {
  const [media, mediaTypes, vendors, workTypes] = await Promise.all([
    mediaId ? repo.getMediaRecord(mediaId) : null,
    repo.getAllMediaTypeNames(), repo.getAllVendorNames(), repo.getAllWorkTypeNames()
  ]);

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${media ? 'Mecra Kaydını Düzenle' : 'Yeni Mecra / Yüklenici'}</h2>

    <div class="field"><label>Mecra Türü *</label>
      <input id="fMediaType" list="mediaTypeList" placeholder="TV, Radyo, Dijital…" value="${media ? escapeHtml(media.mediaType) : ''}">
      ${datalist('mediaTypeList', mediaTypes)}
    </div>
    <div class="field"><label>Yüklenici *</label>
      <input id="fVendor" list="vendorListMedia" placeholder="Örn: Show TV" value="${media ? escapeHtml(media.vendor) : ''}">
      ${datalist('vendorListMedia', vendors)}
    </div>
    <div class="field"><label>İş Türü *</label>
      <input id="fWorkType" list="workTypeList" placeholder="Reklam, Sponsorluk…" value="${media ? escapeHtml(media.workType) : ''}">
      ${datalist('workTypeList', workTypes)}
    </div>

    <div class="row2">
      <div class="field"><label>Alış Tutarı * <span class="hint">(KDV Hariç)</span></label><input id="fPurchase" type="number" step="0.01" value="${media ? media.purchase : ''}"></div>
      <div class="field"><label>Satış Tutarı * <span class="hint">(KDV Hariç)</span></label><input id="fSales" type="number" step="0.01" value="${media ? media.sales : ''}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Ristorno % *</label><input id="fRistorno" type="number" step="0.01" value="${media ? media.ristornoPercent : '0'}"></div>
      <div class="field"><label>KDV</label>
        <select id="fMediaVat">
          ${calc.VAT_RATES.map((r) => `<option value="${r.value}" ${String(media && media.vatRate != null ? media.vatRate : '') === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="row2">
      <div class="field"><label>Başlangıç</label><input id="fMediaStart" type="date" value="${media && media.startDate ? media.startDate : ''}"></div>
      <div class="field"><label>Bitiş</label><input id="fMediaEnd" type="date" value="${media && media.endDate ? media.endDate : ''}"></div>
    </div>
    <div class="field">${noteFieldHtml('fMediaNote', media && media.note ? media.note : '')}</div>

    <div class="preview-box" id="mediaPreview" style="background:var(--primary-bg);border-radius:12px;padding:10px 12px;margin:6px 0 12px;display:flex;flex-direction:column;gap:5px;">
      <div class="pline" style="display:flex;justify-content:space-between;font-size:11.5px;"><span>Ristorno Tutarı</span><b id="pRistorno">0 ₺</b></div>
      <div class="pline" style="display:flex;justify-content:space-between;font-size:11.5px;"><span>Net Ödenecek</span><b id="pNet">0 ₺</b></div>
      <div class="pline" style="display:flex;justify-content:space-between;font-size:11.5px;"><span>Kâr (KDV Hariç)</span><b id="pProfit">0 ₺</b></div>
      <div class="pline" id="pVatLine" style="display:none;justify-content:space-between;font-size:11.5px;color:var(--amber-dark);"><span>Satış KDV Dahil</span><b id="pVatIncl">0 ₺</b></div>
    </div>

    <button class="btn primary" onclick="H.saveMedia('${campaignId}','${media ? media.id : ''}')">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    const update = () => {
      const purchase = Number(sheet.querySelector('#fPurchase').value) || 0;
      const sales = Number(sheet.querySelector('#fSales').value) || 0;
      const pct = Number(sheet.querySelector('#fRistorno').value) || 0;
      const type = sheet.querySelector('#fMediaType').value;
      const vatRate = sheet.querySelector('#fMediaVat').value;
      const ristorno = purchase * (pct / 100);
      const net = calc.isTV(type) ? purchase : purchase - ristorno;
      const profit = sales - purchase + ristorno;
      sheet.querySelector('#pRistorno').textContent = fmt(ristorno);
      sheet.querySelector('#pNet').textContent = fmt(net);
      sheet.querySelector('#pProfit').textContent = fmt(profit);
      const vatLine = sheet.querySelector('#pVatLine');
      if (vatRate) {
        vatLine.style.display = 'flex';
        sheet.querySelector('#pVatIncl').textContent = fmt(calc.vatInclusive(sales, vatRate));
      } else {
        vatLine.style.display = 'none';
      }
    };
    ['fPurchase', 'fSales', 'fRistorno', 'fMediaType', 'fMediaVat'].forEach((id) => {
      sheet.querySelector('#' + id).addEventListener('input', update);
      sheet.querySelector('#' + id).addEventListener('change', update);
    });
    update();
  });
}

export async function saveMedia(campaignId, mediaId) {
  const mediaType = document.getElementById('fMediaType').value.trim();
  const vendor = document.getElementById('fVendor').value.trim();
  const workType = document.getElementById('fWorkType').value.trim();
  const purchase = document.getElementById('fPurchase').value;
  const sales = document.getElementById('fSales').value;
  const ristornoPercent = document.getElementById('fRistorno').value;
  const vatRateRaw = document.getElementById('fMediaVat').value;
  const vatRate = vatRateRaw === '' ? null : Number(vatRateRaw);
  const startDate = document.getElementById('fMediaStart').value || '';
  const endDate = document.getElementById('fMediaEnd').value || '';
  const note = document.getElementById('fMediaNote').value.trim();

  if (!mediaType) { toast('Mecra türü zorunlu', 'error'); return; }
  if (!vendor) { toast('Yüklenici zorunlu', 'error'); return; }
  if (!workType) { toast('İş türü zorunlu', 'error'); return; }
  if (purchase === '' || sales === '' || ristornoPercent === '') { toast('Alış, satış ve ristorno % zorunlu', 'error'); return; }
  if (startDate && endDate && endDate < startDate) { toast('Bitiş tarihi başlangıçtan önce olamaz', 'error'); return; }

  const campaign = await repo.getCampaign(campaignId);
  const data = {
    campaignId,
    campaignName: campaign ? (campaign.name || campaign.productName) : '',
    clientId: campaign ? campaign.clientId : '',
    clientName: campaign ? campaign.clientName : '',
    productId: campaign ? campaign.productId : '',
    mediaType, vendor, workType,
    purchase: Number(purchase), sales: Number(sales), ristornoPercent: Number(ristornoPercent),
    vatRate,
    startDate, endDate, note
  };

  try {
    await Promise.all([repo.addMediaTypeName(mediaType), repo.addVendorName(vendor), repo.addWorkTypeName(workType)]);
    if (mediaId) {
      await repo.updateMedia(mediaId, data);
      toast('Mecra kaydı güncellendi', 'success');
    } else {
      await repo.createMedia(data);
      toast('Mecra kaydı eklendi', 'success');
    }
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteMedia(mediaId, campaignId) {
  if (!confirmAction('Bu mecra kaydını silmek istiyor musun? Finansal geçmiş saklanır.')) return;
  await repo.deleteMedia(mediaId);
  toast('Mecra kaydı silindi', 'success');
  navigate('/campaigns/' + campaignId);
}

// ============================================================================
// cheque sub-fields shared by collection + payment forms
// ============================================================================
function chequeFieldsHtml() {
  return `
  <div class="payment-group" id="chequeGroup" style="display:none;">
    <div class="payment-group-title">${icon('receipt', { size: 15, className: 'icon-inline' })} Çek Bilgileri</div>
    <div class="row2">
      <div class="field"><label>Çek Tarihi</label><input id="fChequeDate" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Vade Tarihi *</label><input id="fChequeDue" type="date"></div>
    </div>
    <div class="row2" style="margin-bottom:0;">
      <div class="field" style="margin-bottom:0;"><label>Banka</label><input id="fChequeBank" placeholder="Banka adı"></div>
      <div class="field" style="margin-bottom:0;"><label>Çek No</label><input id="fChequeNo" placeholder="Çek numarası"></div>
    </div>
  </div>
  <div class="payment-group" id="vadeliGroup" style="display:none;">
    <div class="payment-group-title">${icon('clock', { size: 15, className: 'icon-inline' })} Vadeli Ödeme</div>
    <div class="field" style="margin-bottom:0;"><label>Vade (gün)</label><input id="fVadeliDays" type="number" min="1" placeholder="Örn: 30"></div>
    <p class="hint-note" id="vadeliPreview" style="font-size:10.5px;color:var(--ink-soft);margin:8px 0 0;font-style:italic;"></p>
  </div>`;
}

// §makbuz: photo capture is available for every payment type (Nakit, Havale,
// Çek, Vadeli, Diğer) — up to MAX_PHOTOS images, camera or gallery, shared by
// the collection + payment forms via the module-level `formPhotos` array.
function photoSectionHtml() {
  return `
  <div class="field" style="margin-bottom:14px;">
    <label>${icon('image', { size: 14, className: 'icon-inline' })} Makbuz / Dekont Fotoğrafı</label>
    <div class="photo-btns" id="formPhotoBtns">
      <button type="button" class="btn small outline" onclick="H.captureFormPhoto('camera')">${icon('camera', { size: 15, className: 'icon-inline' })} Kameradan Çek</button>
      <button type="button" class="btn small outline" onclick="H.captureFormPhoto('gallery')">${icon('image', { size: 15, className: 'icon-inline' })} Galeriden Seç</button>
    </div>
    <div id="formPhotoPreview"></div>
  </div>`;
}

function renderFormPhotoPreview() {
  const wrap = document.getElementById('formPhotoPreview');
  const btns = document.getElementById('formPhotoBtns');
  if (!wrap) return;
  wrap.innerHTML = photoStripHtml(formPhotos, {
    onRemove: (i) => `H.removeFormPhoto(${i})`,
    onView: (src) => `H.viewPhotoDataUrl('${src}')`,
    max: MAX_PHOTOS
  });
  if (btns) btns.style.display = formPhotos.length >= MAX_PHOTOS ? 'none' : 'flex';
}

export async function captureFormPhoto(source) {
  if (formPhotos.length >= MAX_PHOTOS) { toast(`En fazla ${MAX_PHOTOS} fotoğraf eklenebilir`, 'error'); return; }
  const dataUrl = await pickPhoto(source);
  if (dataUrl) {
    formPhotos.push(dataUrl);
    renderFormPhotoPreview();
  }
}

export function removeFormPhoto(index) {
  formPhotos.splice(index, 1);
  renderFormPhotoPreview();
}

export function viewPhotoDataUrl(src) {
  openLightbox(src);
}

function wirePaymentTypeToggle(sheet, dateFieldId) {
  const sel = sheet.querySelector('#fPayType');
  const chequeGroup = sheet.querySelector('#chequeGroup');
  const vadeliGroup = sheet.querySelector('#vadeliGroup');
  const toggle = () => {
    const v = sel.value;
    chequeGroup.style.display = v === 'Çek' ? 'block' : 'none';
    vadeliGroup.style.display = v === 'Vadeli' ? 'block' : 'none';
  };
  sel.addEventListener('change', toggle);
  toggle();

  const vadeliDays = sheet.querySelector('#fVadeliDays');
  if (vadeliDays) {
    vadeliDays.addEventListener('input', () => {
      const dateVal = sheet.querySelector('#' + dateFieldId).value || todayISO();
      const days = Number(vadeliDays.value) || 0;
      const due = addDays(dateVal, days);
      sheet.querySelector('#vadeliPreview').textContent = days > 0 ? `Vade tarihi: ${due.split('-').reverse().join('.')}` : '';
    });
  }
}

async function saveChequeIfNeeded({ direction, counterpartyName, campaignId, campaignName, amount, date, clientId, vendor }) {
  const payType = document.getElementById('fPayType').value;
  if (payType !== 'Çek') return null;
  const dueDate = document.getElementById('fChequeDue').value;
  if (!dueDate) { throw new Error('Çek vade tarihi zorunlu'); }
  const cheque = await repo.createCheque({
    direction,
    counterpartyName,
    campaignId, campaignName,
    // §73: stamp clientId/vendor (when known) so this cheque surfaces on the
    // Customer/Campaign/Vendor detail pages, not just Finans→Çekler.
    clientId: clientId || null,
    vendor: vendor || null,
    chequeDate: document.getElementById('fChequeDate').value || date,
    dueDate,
    bank: document.getElementById('fChequeBank').value.trim(),
    chequeNumber: document.getElementById('fChequeNo').value.trim(),
    amount,
    photos: formPhotos.slice(),
    status: null,
    note: ''
  });
  return cheque.id;
}

function readVadeliDueDate(date) {
  const payType = document.getElementById('fPayType').value;
  if (payType !== 'Vadeli') return null;
  const days = Number(document.getElementById('fVadeliDays').value) || 0;
  return days > 0 ? addDays(date, days) : null;
}

// ============================================================================
// TAHSİLAT (Customer Collection)
// ============================================================================
export async function openCollectionForm(ctx = {}) {
  formPhotos = [];
  const clients = await repo.getClients();
  const campaigns = ctx.clientId ? await repo.getCampaignsForClient(ctx.clientId) : [];

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Tahsilat Ekle</h2>
    <div class="field"><label>Müşteri *</label>
      <select id="fColClient">
        <option value="">Seç…</option>
        ${clients.map((c) => `<option value="${c.id}" ${c.id === ctx.clientId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Kampanya *</label>
      <select id="fColCampaign">
        <option value="">Önce müşteri seç…</option>
        ${campaigns.map((c) => `<option value="${c.id}" ${c.id === ctx.campaignId ? 'selected' : ''}>${escapeHtml(c.name || c.productName)} (${c.startDate} — ${c.endDate})</option>`).join('')}
      </select>
    </div>
    <div class="row2">
      <div class="field"><label>Tarih *</label><input id="fColDate" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Tutar *</label><input id="fColAmount" type="number" step="0.01" placeholder="0"></div>
    </div>
    <div class="field"><label>Ödeme Türü *</label>
      <select id="fPayType">
        ${repo.PAYMENT_TYPES.map((t) => `<option value="${t}" ${ctx.presetPaymentType === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    ${chequeFieldsHtml()}
    ${photoSectionHtml()}
    <div class="field">${noteFieldHtml('fColNote')}</div>
    <button class="btn primary" onclick="H.saveCollection()">Kaydet</button>
  `;

  openSheet(html, (sheet) => {
    wirePaymentTypeToggle(sheet, 'fColDate');
    const clientSel = sheet.querySelector('#fColClient');
    const campSel = sheet.querySelector('#fColCampaign');
    const reloadCampaigns = async () => {
      const cid = clientSel.value;
      if (!cid) { campSel.innerHTML = '<option value="">Önce müşteri seç…</option>'; return; }
      const camps = await repo.getCampaignsForClient(cid);
      campSel.innerHTML = '<option value="">Seç…</option>' + camps.map((c) => `<option value="${c.id}">${escapeHtml(c.name || c.productName)} (${c.startDate} — ${c.endDate})</option>`).join('');
    };
    clientSel.addEventListener('change', reloadCampaigns);
  });
}

export async function saveCollection() {
  const clientId = document.getElementById('fColClient').value;
  const campaignId = document.getElementById('fColCampaign').value;
  const date = document.getElementById('fColDate').value;
  const amount = document.getElementById('fColAmount').value;
  const paymentType = document.getElementById('fPayType').value;
  const note = document.getElementById('fColNote').value.trim();

  if (!clientId) { toast('Müşteri seçmelisin', 'error'); return; }
  if (!campaignId) { toast('Kampanya seçmelisin', 'error'); return; }
  if (!date) { toast('Tarih zorunlu', 'error'); return; }
  if (amount === '' || Number(amount) < 0) { toast('Geçerli bir tutar gir', 'error'); return; }

  const [client, campaign] = await Promise.all([repo.getClient(clientId), repo.getCampaign(campaignId)]);
  const campaignName = campaign ? (campaign.name || campaign.productName) : '';

  try {
    let chequeId = null;
    try {
      chequeId = await saveChequeIfNeeded({ direction: 'received', counterpartyName: client ? client.name : '', campaignId, campaignName, amount: Number(amount), date, clientId });
    } catch (e) {
      toast(e.message, 'error');
      return;
    }
    const dueDate = readVadeliDueDate(date);
    await repo.createCollection({
      clientId, clientName: client ? client.name : '',
      campaignId, campaignName,
      date, amount: Number(amount), paymentType, note,
      chequeId, dueDate,
      photos: formPhotos.slice()
    });
    toast('Tahsilat eklendi', 'success');
    formPhotos = [];
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteCollection(collectionId) {
  if (!confirmAction('Bu tahsilatı silmek istiyor musun?')) return;
  const col = await repo.getCollection(collectionId);
  await repo.deleteCollection(collectionId);
  if (col && col.chequeId) await repo.deleteCheque(col.chequeId);
  toast('Tahsilat silindi', 'success');
  closeSheet();
  refresh();
}

// ============================================================================
// ÖDEME (Vendor Payment)
// ============================================================================
export async function openPaymentForm(ctx = {}) {
  formPhotos = [];
  const clients = await repo.getClients();
  const campaigns = ctx.clientId ? await repo.getCampaignsForClient(ctx.clientId) : [];
  const vendors = await repo.getAllVendorNames();

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Ödeme Ekle</h2>
    <div class="field"><label>Müşteri *</label>
      <select id="fPayClient">
        <option value="">Seç…</option>
        ${clients.map((c) => `<option value="${c.id}" ${c.id === ctx.clientId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Kampanya *</label>
      <select id="fPayCampaign">
        <option value="">Önce müşteri seç…</option>
        ${campaigns.map((c) => `<option value="${c.id}" ${c.id === ctx.campaignId ? 'selected' : ''}>${escapeHtml(c.name || c.productName)} (${c.startDate} — ${c.endDate})</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Yüklenici *</label>
      <input id="fPayVendor" list="vendorListPay" placeholder="Yüklenici seç veya yaz" value="${ctx.vendor ? escapeHtml(ctx.vendor) : ''}">
      ${datalist('vendorListPay', vendors)}
    </div>
    <div class="row2">
      <div class="field"><label>Tarih *</label><input id="fPayDate" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Tutar *</label><input id="fPayAmount" type="number" step="0.01" placeholder="0"></div>
    </div>
    <div class="field"><label>Ödeme Türü *</label>
      <select id="fPayType">
        ${repo.PAYMENT_TYPES.map((t) => `<option value="${t}" ${ctx.presetPaymentType === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    ${chequeFieldsHtml()}
    ${photoSectionHtml()}
    <div class="field">${noteFieldHtml('fPayNote')}</div>
    <button class="btn primary" onclick="H.savePayment()">Kaydet</button>
  `;

  openSheet(html, (sheet) => {
    wirePaymentTypeToggle(sheet, 'fPayDate');
    const clientSel = sheet.querySelector('#fPayClient');
    const campSel = sheet.querySelector('#fPayCampaign');
    const reloadCampaigns = async () => {
      const cid = clientSel.value;
      if (!cid) { campSel.innerHTML = '<option value="">Önce müşteri seç…</option>'; return; }
      const camps = await repo.getCampaignsForClient(cid);
      campSel.innerHTML = '<option value="">Seç…</option>' + camps.map((c) => `<option value="${c.id}">${escapeHtml(c.name || c.productName)} (${c.startDate} — ${c.endDate})</option>`).join('');
    };
    clientSel.addEventListener('change', reloadCampaigns);
  });
}

export async function savePayment() {
  const clientId = document.getElementById('fPayClient').value;
  const campaignId = document.getElementById('fPayCampaign').value;
  const vendor = document.getElementById('fPayVendor').value.trim();
  const date = document.getElementById('fPayDate').value;
  const amount = document.getElementById('fPayAmount').value;
  const paymentType = document.getElementById('fPayType').value;
  const note = document.getElementById('fPayNote').value.trim();

  if (!clientId) { toast('Müşteri seçmelisin', 'error'); return; }
  if (!campaignId) { toast('Kampanya seçmelisin', 'error'); return; }
  if (!vendor) { toast('Yüklenici seçmelisin', 'error'); return; }
  if (!date) { toast('Tarih zorunlu', 'error'); return; }
  if (amount === '' || Number(amount) < 0) { toast('Geçerli bir tutar gir', 'error'); return; }

  const [client, campaign] = await Promise.all([repo.getClient(clientId), repo.getCampaign(campaignId)]);
  const campaignName = campaign ? (campaign.name || campaign.productName) : '';

  try {
    let chequeId = null;
    try {
      chequeId = await saveChequeIfNeeded({ direction: 'given', counterpartyName: vendor, campaignId, campaignName, amount: Number(amount), date, clientId, vendor });
    } catch (e) {
      toast(e.message, 'error');
      return;
    }
    const dueDate = readVadeliDueDate(date);
    await repo.addVendorName(vendor);
    await repo.createPayment({
      clientId, clientName: client ? client.name : '',
      campaignId, campaignName, vendor,
      date, amount: Number(amount), paymentType, note,
      chequeId, dueDate,
      photos: formPhotos.slice()
    });
    toast('Ödeme eklendi', 'success');
    formPhotos = [];
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deletePayment(paymentId) {
  if (!confirmAction('Bu ödemeyi silmek istiyor musun?')) return;
  const pay = await repo.getPayment(paymentId);
  await repo.deletePayment(paymentId);
  if (pay && pay.chequeId) await repo.deleteCheque(pay.chequeId);
  toast('Ödeme silindi', 'success');
  closeSheet();
  refresh();
}

// ============================================================================
// transaction (collection/payment) detail sheet
// ============================================================================
export async function openPaymentDetail(paymentId) {
  const p = await repo.getPayment(paymentId);
  if (!p) return;
  await showTransactionDetail(p, 'payment', p.vendor);
}

export async function openCollectionDetail(collectionId) {
  const c = await repo.getCollection(collectionId);
  if (!c) return;
  await showTransactionDetail(c, 'collection', c.clientName);
}

async function showTransactionDetail(rec, kind, targetLabel) {
  const cheque = rec.chequeId ? await repo.getCheque(rec.chequeId) : null;
  const chequePhotos = cheque ? (cheque.photos && cheque.photos.length ? cheque.photos : (cheque.photo ? [cheque.photo] : [])) : [];
  const recPhotos = rec.photos && rec.photos.length ? rec.photos : [];
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${kind === 'collection' ? 'Tahsilat Detayı' : 'Ödeme Detayı'}</h2>
    ${cheque ? `
      <div class="cheque-detail-box">
        <div class="detail-row"><span class="k">${icon('receipt', { size: 14, className: 'icon-inline' })} Çek Durumu</span><span class="v">${chequeStatusChip(cheque)}</span></div>
        <div class="detail-row"><span class="k">${rec.paymentType === 'Çek' && kind === 'collection' ? 'Alınış Tarihi' : 'Veriliş Tarihi'}</span><span class="v">${cheque.chequeDate ? cheque.chequeDate.split('-').reverse().join('.') : '—'}</span></div>
        <div class="detail-row"><span class="k">Vade Tarihi</span><span class="v">${cheque.dueDate ? cheque.dueDate.split('-').reverse().join('.') : '—'}</span></div>
        <div class="detail-row"><span class="k">Banka</span><span class="v">${escapeHtml(cheque.bank || '—')}</span></div>
        <div class="detail-row"><span class="k">Çek No</span><span class="v">${escapeHtml(cheque.chequeNumber || '—')}</span></div>
        <div class="detail-row total"><span class="k">Tutar</span><span class="v">${fmt(cheque.amount)}</span></div>
        ${photoGalleryHtml(chequePhotos)}
        <button class="btn small outline" style="width:100%;margin-top:10px;" onclick="H.closeSheet();H.goto('/finance/cheques/${cheque.id}')">Çek Detayına Git</button>
      </div>
    ` : ''}
    <div class="detail-row"><span class="k">${kind === 'collection' ? 'Müşteri' : 'Yüklenici'}</span><span class="v">${escapeHtml(targetLabel || '—')}</span></div>
    <div class="detail-row"><span class="k">Kampanya</span><span class="v">${escapeHtml(rec.campaignName || '—')}</span></div>
    <div class="detail-row"><span class="k">Tarih</span><span class="v">${rec.date ? rec.date.split('-').reverse().join('.') : '—'}</span></div>
    <div class="detail-row total"><span class="k">Tutar</span><span class="v">${fmt(rec.amount)}</span></div>
    <div class="detail-row"><span class="k">Ödeme Türü</span><span class="v">${escapeHtml(rec.paymentType)}</span></div>
    ${rec.dueDate ? `<div class="detail-row"><span class="k">Vade Tarihi</span><span class="v">${rec.dueDate.split('-').reverse().join('.')}</span></div>` : ''}
    ${recPhotos.length ? `<div class="field" style="margin-top:6px;"><label>${icon('image', { size: 13, className: 'icon-inline' })} Makbuz Fotoğrafları</label>${photoGalleryHtml(recPhotos)}</div>` : ''}
    ${rec.note ? `<div class="note-box"><b>Not</b>${escapeHtml(rec.note)}</div>` : ''}
    <button class="btn danger" onclick="H.${kind === 'collection' ? 'deleteCollection' : 'deletePayment'}('${rec.id}')">Sil</button>
  `;
  openSheet(html);
}

// ============================================================================
// QUICK ADD (central + button)
// ============================================================================
export function openQuickAddMenu() {
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Ekle</h2>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.closeSheet();H.openCustomerForm()"><span class="ico">${icon('users', { size: 18 })}</span>Yeni Müşteri</button>
      <button class="action-item" onclick="H.quickNewProduct()"><span class="ico">${icon('package', { size: 18 })}</span>Yeni Ürün</button>
      <button class="action-item" onclick="H.quickNewCampaign()"><span class="ico">${icon('megaphone', { size: 18 })}</span>Yeni Kampanya</button>
      <button class="action-item" onclick="H.closeSheet();H.openCollectionForm({})"><span class="ico">${icon('banknote', { size: 18 })}</span>Tahsilat Ekle</button>
      <button class="action-item" onclick="H.closeSheet();H.openPaymentForm({})"><span class="ico">${icon('landmark', { size: 18 })}</span>Ödeme Ekle</button>
      <button class="action-item" onclick="H.quickNewCheque()"><span class="ico">${icon('receipt', { size: 18 })}</span>Çek Ekle</button>
    </div>
  `;
  openSheet(html);
}

export async function quickNewProduct() {
  const clients = await repo.getClients();
  if (clients.length === 0) {
    toast('Önce bir müşteri ekle', 'error');
    closeSheet();
    openCustomerForm();
    return;
  }
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Hangi Müşteri İçin?</h2>
    <div class="field"><label>Müşteri</label><select id="qpClient">${clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <button class="btn primary" onclick="H.quickNewProductConfirm()">Devam Et</button>
  `;
  openSheet(html);
}

export function quickNewProductConfirm() {
  const clientId = document.getElementById('qpClient').value;
  closeSheet();
  openProductForm(clientId);
}

export async function quickNewCampaign() {
  const clients = await repo.getClients();
  if (clients.length === 0) {
    toast('Önce bir müşteri ekle', 'error');
    closeSheet();
    openCustomerForm();
    return;
  }
  const firstClientProducts = await repo.getProductsForClient(clients[0].id);
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Hangi Ürün İçin?</h2>
    <div class="field"><label>Müşteri</label><select id="qcClient">${clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Ürün</label><select id="qcProduct">${firstClientProducts.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
    <button class="btn primary" onclick="H.quickNewCampaignConfirm()">Devam Et</button>
  `;
  openSheet(html, (sheet) => {
    sheet.querySelector('#qcClient').addEventListener('change', async (e) => {
      const products = await repo.getProductsForClient(e.target.value);
      const sel = sheet.querySelector('#qcProduct');
      if (products.length === 0) {
        sel.innerHTML = '<option value="">Bu müşterinin ürünü yok</option>';
      } else {
        sel.innerHTML = products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
      }
    });
  });
}

export function quickNewCampaignConfirm() {
  const clientId = document.getElementById('qcClient').value;
  const productId = document.getElementById('qcProduct').value;
  if (!productId) { toast('Bu müşterinin önce bir ürünü olmalı', 'error'); return; }
  closeSheet();
  openCampaignForm(clientId, productId);
}

export function quickNewCheque() {
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Çek Yönü</h2>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.closeSheet();H.openCollectionForm({presetPaymentType:'Çek'})"><span class="ico">${icon('arrowDownCircle', { size: 18 })}</span>Alınan Çek (Tahsilat)</button>
      <button class="action-item" onclick="H.closeSheet();H.openPaymentForm({presetPaymentType:'Çek'})"><span class="ico">${icon('arrowUpCircle', { size: 18 })}</span>Verilen Çek (Ödeme)</button>
    </div>
  `;
  openSheet(html);
}

// ---------------------------------------------------------------------------
// screens-forms.js — every create/edit bottom-sheet form + delete actions +
// the customer/vendor/campaign quick-add flows. All functions here are
// exposed on window.H by app.js so generated HTML can call them directly
// via onclick attributes.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import * as calc from './calc.js';
import * as agg from './aggregate.js';
import { fmt, fmtN, todayISO, addDays, daysBetween, formatDate, escapeHtml, jsAttr, toast, uid } from './util.js';
import { openSheet, closeSheet, navigate, refresh, openLightbox, noteFieldHtml, confirmDialog } from './ui.js';
import { pickPhoto } from './photo.js';
import { chequeStatusChip, photoStripHtml, photoGalleryHtml } from './components.js';
import { icon } from './icons.js';
import { isAdmin } from './cloud/team.js';

const MAX_PHOTOS = 3;
let formPhotos = []; // transient dataURL[] held while a tahsilat/ödeme sub-form is open

function datalist(id, options) {
  return `<datalist id="${id}">${options.map((o) => `<option value="${escapeHtml(o)}">`).join('')}</datalist>`;
}

// ============================================================================
// KÜNYE (şirket profili) — Müşteri VE Mecra/Yüklenici formlarında ortak.
// Fatura Adresi, Adres, VKN, IBAN + tek bir kaşe fotoğrafı. `stampPhoto`
// module-level transient — tıpkı formPhotos gibi, form açıldığında doldurulur
// / sıfırlanır, sadece kaydederken kalıcı hale gelir.
// ============================================================================
let stampPhoto = null;

function kunyeFieldsHtml(entity) {
  stampPhoto = entity && entity.stampPhoto ? entity.stampPhoto : null;
  return `
    <div class="fee-box" style="margin-top:4px;">
      <div class="field"><label>Fatura Adresi</label><textarea id="fKunyeBillingAddress" placeholder="Fatura adresi">${escapeHtml(entity && entity.billingAddress ? entity.billingAddress : '')}</textarea></div>
      <div class="field"><label>Adres</label><textarea id="fKunyeAddress" placeholder="Açık adres">${escapeHtml(entity && entity.address ? entity.address : '')}</textarea></div>
      <div class="row2">
        <div class="field" style="margin-bottom:0;"><label>VKN</label><input id="fKunyeVkn" placeholder="Vergi Kimlik No" value="${entity && entity.vkn ? escapeHtml(entity.vkn) : ''}"></div>
        <div class="field" style="margin-bottom:0;"><label>IBAN</label><input id="fKunyeIban" placeholder="TR…" value="${entity && entity.iban ? escapeHtml(entity.iban) : ''}"></div>
      </div>
      <div class="field" style="margin-top:10px;margin-bottom:0;">
        <label>${icon('image', { size: 14, className: 'icon-inline' })} Kaşe Fotoğrafı</label>
        <div class="photo-btns" id="kunyeStampBtns">
          <button type="button" class="btn small outline" onclick="H.captureStampPhoto('camera')">${icon('camera', { size: 15, className: 'icon-inline' })} Kameradan Çek</button>
          <button type="button" class="btn small outline" onclick="H.captureStampPhoto('gallery')">${icon('image', { size: 15, className: 'icon-inline' })} Galeriden Seç</button>
        </div>
        <div id="kunyeStampPreview"></div>
      </div>
    </div>`;
}

function renderStampPreview() {
  const wrap = document.getElementById('kunyeStampPreview');
  const btns = document.getElementById('kunyeStampBtns');
  if (!wrap) return;
  wrap.innerHTML = photoStripHtml(stampPhoto ? [stampPhoto] : [], {
    onRemove: () => `H.removeStampPhoto()`,
    onView: (src) => `H.viewPhotoDataUrl('${src}')`,
    max: 1
  });
  if (btns) btns.style.display = stampPhoto ? 'none' : 'flex';
}

export async function captureStampPhoto(source) {
  const dataUrl = await pickPhoto(source);
  if (dataUrl) {
    stampPhoto = dataUrl;
    renderStampPreview();
  }
}

export function removeStampPhoto() {
  stampPhoto = null;
  renderStampPreview();
}

function readKunyeFields() {
  return {
    billingAddress: document.getElementById('fKunyeBillingAddress').value.trim(),
    address: document.getElementById('fKunyeAddress').value.trim(),
    vkn: document.getElementById('fKunyeVkn').value.trim(),
    iban: document.getElementById('fKunyeIban').value.trim(),
    stampPhoto: stampPhoto || null
  };
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

    ${isAdmin() ? `
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
    </div>` : ''}

    <div class="section-title" style="margin-top:4px;">Künye</div>
    ${kunyeFieldsHtml(client)}

    <button class="btn primary" onclick="H.guard(this, () => H.saveCustomer('${client ? client.id : ''}'))" style="margin-top:14px;">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    const feeTypeEl = sheet.querySelector('#fFeeType'); // absent for non-admin — see §roles above
    if (feeTypeEl) {
      feeTypeEl.addEventListener('change', (e) => {
        const wrap = sheet.querySelector('#fFeeValueWrap');
        const label = sheet.querySelector('#fFeeValueLabel');
        wrap.style.display = e.target.value === 'none' ? 'none' : 'block';
        label.textContent = e.target.value === 'fixed' ? 'Tutar (₺)' : 'Yüzde (%)';
      });
    }
    renderStampPreview();
    sheet.querySelector('#fClientName').focus();
  });
}

export async function saveCustomer(clientId) {
  const name = document.getElementById('fClientName').value.trim();
  if (!name) { toast('Müşteri adı zorunlu', 'error'); return; }
  // §roles: ajans ücreti alanı personelden gizli (bkz. openCustomerForm) —
  // form alanları yoksa mevcut değeri koru, "none/0"a düşürme.
  const feeTypeEl = document.getElementById('fFeeType');
  const feeValueEl = document.getElementById('fFeeValue');
  let data;
  if (feeTypeEl) {
    const feeType = feeTypeEl.value;
    const feeValue = Number(feeValueEl.value) || 0;
    data = { name, agencyFeeType: feeType, agencyFeeValue: feeType === 'none' ? 0 : feeValue };
  } else {
    data = { name };
  }
  Object.assign(data, readKunyeFields());
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
  if (!(await confirmDialog('Bu müşteriyi silmek istiyor musun? Finansal geçmiş saklanır.'))) return;
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
    <button class="btn primary" onclick="H.guard(this, () => H.saveProduct('${clientId}','${product ? product.id : ''}'))">Kaydet</button>
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
  if (!(await confirmDialog('Bu ürünü silmek istiyor musun? Finansal geçmiş saklanır.'))) return;
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

    ${isAdmin() ? `
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
    </div>` : ''}

    <button class="btn primary" onclick="H.guard(this, () => H.saveCampaign('${clientId}','${productId}','${campaign ? campaign.id : ''}'))">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    const feeTypeEl = sheet.querySelector('#fCampFeeType'); // absent for non-admin — see §roles above
    if (feeTypeEl) {
      feeTypeEl.addEventListener('change', (e) => {
        const wrap = sheet.querySelector('#fCampFeeValueWrap');
        const label = sheet.querySelector('#fCampFeeValueLabel');
        wrap.style.display = e.target.value === 'none' ? 'none' : 'grid';
        label.textContent = e.target.value === 'fixed' ? 'Tutar (₺)' : 'Yüzde (%)';
      });
    }
  });
}

export async function saveCampaign(clientId, productId, campaignId) {
  const name = document.getElementById('fCampName').value.trim();
  const startDate = document.getElementById('fCampStart').value;
  const endDate = document.getElementById('fCampEnd').value;
  const note = document.getElementById('fCampNote').value.trim();

  if (!startDate || !endDate) { toast('Başlangıç ve bitiş tarihi zorunlu', 'error'); return; }
  if (endDate < startDate) { toast('Bitiş tarihi başlangıçtan önce olamaz', 'error'); return; }

  const [client, product] = await Promise.all([repo.getClient(clientId), repo.getProduct(productId)]);
  const data = {
    clientId, productId,
    clientName: client ? client.name : '',
    productName: product ? product.name : '',
    name: name || '',
    startDate, endDate, note
  };
  // §roles: ajans ücreti alanı personelden gizli (bkz. openCampaignForm) —
  // form alanları yoksa mevcut değeri koru, "none/0"a düşürme.
  const feeTypeEl = document.getElementById('fCampFeeType');
  if (feeTypeEl) {
    const feeType = feeTypeEl.value;
    const feeValue = Number(document.getElementById('fCampFeeValue').value) || 0;
    const feeVatRaw = document.getElementById('fCampFeeVat').value;
    const feeVatRate = feeVatRaw === '' ? null : Number(feeVatRaw);
    data.agencyFeeType = feeType;
    data.agencyFeeValue = feeType === 'none' ? 0 : feeValue;
    data.agencyFeeVatRate = feeType === 'none' ? null : feeVatRate;
  }
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
  if (!(await confirmDialog('Bu kampanyayı silmek istiyor musun? Finansal geçmiş saklanır.'))) return;
  await repo.cascadeDeleteCampaign(campaignId);
  toast('Kampanya silindi', 'success');
  navigate('/customers/' + clientId + '/products/' + productId);
}

// ============================================================================
// MECRA / YÜKLENİCİ KAYDI (CampaignMedia)
// ============================================================================
// §kalem-takip: TV seçilince altında çıkan Sponsor/Banner/Kuşak seçimi hiçbir
// veriye yazılmıyor — sadece bu form açıkken kalem etiketlerinin varsayılan
// birimini (Hafta/Bant/Kuşak) ve başlıktaki ikonu belirlemek için kullanılan,
// oturum içi kozmetik bir yardımcı. Mecra Türü her zaman sade "TV" olarak
// kaydedilir ki calc.isTV() ve mevcut TV ristorno kuralı bozulmasın.
const KALEM_FLAVORS = {
  Banner: { unit: 'Adet', title: 'Adet Bazlı Takip', iconName: 'image' },
  Kuşak: { unit: 'Saniye', title: 'Saniye Bazlı Takip', iconName: 'clock' }
};
const KALEM_DEFAULT_FLAVOR = { unit: 'Hafta', title: 'Haftalık Takip', iconName: 'calendar' };
// §is-turu-birim: artık ayrı bir TV alt-tür seçimi (Sponsor/Banner/Kuşak
// pilleri) yok — haftalık takip birimi doğrudan İş Türü alanına yazılan
// metinden anlaşılıyor, Mecra Türü ne olursa olsun (sadece TV'ye özel değil).
// "Sponsorluk" (ya da tanınmayan başka bir iş türü) → Hafta, "Banner"/"Bant"
// → Adet, "Kuşak" → Saniye. Kullanıcı İş Türü'nü değiştirdikçe otomatik
// güncellenir (bkz. openMediaForm/quickNewCampaign'daki İş Türü input
// dinleyicileri).
function kalemFlavorForWorkType(workType) {
  const key = (workType || '').trim().toLocaleLowerCase('tr-TR');
  if (!key) return KALEM_DEFAULT_FLAVOR;
  if (key.includes('banner') || key.includes('bant')) return KALEM_FLAVORS.Banner;
  if (key.includes('kuşak')) return KALEM_FLAVORS.Kuşak;
  return KALEM_DEFAULT_FLAVOR;
}

// §kalem-satis: her kalem satırı artık Alış (amount) VE Satış (salesAmount)
// olmak üzere iki ayrı tutar taşıyor — eski kayıtlarda salesAmount hiç
// yoktu, bu yüzden okurken her zaman `Number(...) || 0` ile geriye dönük
// uyumlu (eksikse 0) davranıyoruz.
function kalemRowHtml(it) {
  return `
    <div class="kalem-row">
      <input class="klabel" value="${escapeHtml(it.label)}">
      <input class="kamount" type="number" step="0.01" value="${it.amount}">
      <input class="ksales" type="number" step="0.01" value="${it.salesAmount != null ? it.salesAmount : 0}">
      <button type="button" class="kdel">${icon('x', { size: 13 })}</button>
    </div>
  `;
}

export async function openMediaForm(campaignId, mediaId) {
  const [media, mediaTypes] = await Promise.all([
    mediaId ? repo.getMediaRecord(mediaId) : null,
    repo.getAllMediaTypeNames()
  ]);

  // §kalem-takip: Mecra Türü artık seçmeli — DEFAULT_MEDIA_TYPES listesi +
  // "elle yazacağım". Var olan bir kayıt bu sabit listede yoksa (ör. daha
  // önce serbestçe "Tv dizi sponsorluk" gibi yazılmışsa) hiçbir veri
  // kaybetmeden doğrudan elle-yazma moduna düşüyoruz — metin aynen korunur.
  const initialType = media ? media.mediaType : 'TV';
  const manualMode = media ? !repo.DEFAULT_MEDIA_TYPES.includes(media.mediaType) : false;
  // §yuklenici-secmeli: Yüklenici önerileri artık GLOBAL tüm-yükleniciler
  // listesi değil, seçili Mecra Türüne göre (TV/Radio: küratörlü kanal
  // listesi + kullanıcının o türde daha önce girdikleri; diğer türlerde
  // sadece o türde daha önce girilenler) — Mecra Türü değişince aşağıdaki
  // refreshVendorDatalist() ile yeniden doldurulur, elle yazma her zaman açık.
  // §is-turu-tur-bazli: İş Türü önerileri de aynı şekilde artık Mecra
  // Türü'ne göre — o türde gerçekten kullanılmış tüm iş türleri (sabit bir
  // sayıyla sınırlı değil), Mecra Türü değişince refreshWorkTypeDatalist()
  // ile yeniden dolar.
  const [vendors, workTypes] = await Promise.all([
    repo.getVendorNamesForType(initialType),
    repo.getWorkTypeNamesForType(initialType)
  ]);
  const budgetItems = media && media.budgetEnabled && Array.isArray(media.budgetItems) ? media.budgetItems : [];
  const budgetOn = !!(media && media.budgetEnabled);
  // §musteri-kdv: eski kayıtlarda salesVatRate hiç yoktu — dokunmadan
  // kaydedince hesap değişmesin diye, ilk gösterimde mecra/alış KDV'siyle
  // aynı değere düşülüyor (calc.resolvedSalesVatRate ile birebir aynı mantık).
  const salesVatInitial = media ? (media.salesVatRate !== undefined ? media.salesVatRate : (media.vatRate != null ? media.vatRate : '')) : '';

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${media ? 'Mecra Kaydını Düzenle' : 'Yeni Mecra / Yüklenici'}</h2>

    <div class="field"><label>Mecra Türü *</label>
      <select id="fMediaTypeSelect" style="${manualMode ? 'display:none;' : ''}">
        ${repo.DEFAULT_MEDIA_TYPES.map((t) => `<option value="${escapeHtml(t)}" ${initialType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        <option value="__manual__">✏️ Listede yok, elle yazacağım</option>
      </select>
      <input id="fMediaType" list="mediaTypeList" placeholder="Mecra türünü yaz…" value="${escapeHtml(initialType)}" style="${manualMode ? '' : 'display:none;'}">
      ${datalist('mediaTypeList', mediaTypes)}
      <div class="kalem-note" id="manualBackHint" style="${manualMode ? '' : 'display:none;'}">Listeye dönmek için <a href="#" id="backToMediaList">buraya dokun</a></div>
    </div>
    <div class="field"><label>İş Türü *</label>
      <input id="fWorkType" list="workTypeList" placeholder="Reklam, Sponsorluk…" value="${media ? escapeHtml(media.workType) : ''}">
      ${datalist('workTypeList', workTypes)}
    </div>
    <div class="field"><label>Yüklenici *</label>
      <input id="fVendor" list="vendorListMedia" placeholder="Örn: Show TV" value="${media ? escapeHtml(media.vendor) : ''}">
      ${datalist('vendorListMedia', vendors)}
    </div>
    <div class="field">${noteFieldHtml('fMediaNote', media && media.note ? media.note : '', 'Açıklama')}</div>

    <div class="kalem-section">
      <div class="kalem-toggle-row">
        <span class="ktitle" id="kalemTitle">${icon('calendar', { size: 15 })} Haftalık Takip</span>
        <label class="switch">
          <input type="checkbox" id="fBudgetEnabled" ${budgetOn ? 'checked' : ''}>
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>
      <div id="kalemBody" style="${budgetOn ? '' : 'display:none;'}">
        <div class="kalem-note">Alış ve Satış Tutarları bu kalemlerin toplamından otomatik hesaplanır.</div>
        <div class="kalem-col-labels"><span class="kcl-label"></span><span class="kcl-amount">Alış</span><span class="kcl-amount">Satış</span><span class="kcl-del"></span></div>
        <div class="kalem-list" id="kalemList">${budgetItems.map(kalemRowHtml).join('')}</div>
        <button class="kalem-add" id="kalemAddBtn" type="button">+ Kalem Ekle</button>
        <div class="kalem-total-row">
          <div class="kalem-total"><span>Alış</span><b id="kalemTotalVal">0 ₺</b></div>
          <div class="kalem-total"><span>Satış</span><b id="kalemSalesTotalVal">0 ₺</b></div>
        </div>
      </div>
    </div>

    <div class="row2">
      <div class="field"><label>Alış Tutarı * <span class="hint">(KDV Hariç)</span></label><input id="fPurchase" type="number" step="0.01" value="${media ? media.purchase : ''}" ${budgetOn ? 'disabled' : ''}></div>
      <div class="field"><label>Satış Tutarı * <span class="hint">(KDV Hariç)</span></label><input id="fSales" type="number" step="0.01" value="${media ? media.sales : ''}" ${budgetOn ? 'disabled' : ''}></div>
    </div>
    <div class="row2">
      <div class="field"><label>Ristorno % *</label><input id="fRistorno" type="number" step="0.01" value="${media ? media.ristornoPercent : '0'}"></div>
      <div class="field"><label>Alış KDV</label>
        <select id="fMediaVat">
          ${calc.VAT_RATES.map((r) => `<option value="${r.value}" ${String(media && media.vatRate != null ? media.vatRate : '') === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Satış KDV <span class="hint">(müşteriden farklı oranda tahsil ediyorsan)</span></label>
      <select id="fSalesVat">
        ${calc.VAT_RATES.map((r) => `<option value="${r.value}" ${String(salesVatInitial) === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>
    </div>

    <div class="row2">
      <div class="field"><label>Başlangıç</label><input id="fMediaStart" type="date" value="${media && media.startDate ? media.startDate : ''}"></div>
      <div class="field"><label>Bitiş</label><input id="fMediaEnd" type="date" value="${media && media.endDate ? media.endDate : ''}"></div>
    </div>

    <div class="preview-box" id="mediaPreview" style="background:var(--primary-bg);border-radius:12px;padding:10px 12px;margin:6px 0 12px;display:flex;flex-direction:column;gap:5px;">
      <div class="pline" style="display:flex;justify-content:space-between;font-size:11.5px;"><span>Ristorno Tutarı</span><b id="pRistorno">0 ₺</b></div>
      <div class="pline" style="display:flex;justify-content:space-between;font-size:11.5px;"><span>Net Ödenecek</span><b id="pNet">0 ₺</b></div>
      ${isAdmin() ? `<div class="pline" style="display:flex;justify-content:space-between;font-size:11.5px;"><span>Kâr (KDV Hariç)</span><b id="pProfit">0 ₺</b></div>` : ''}
      <div class="pline" id="pVatAmountLine" style="display:none;justify-content:space-between;font-size:11.5px;color:var(--amber-dark);"><span>KDV Tutarı</span><b id="pVatAmount">0 ₺</b></div>
      <div class="pline" id="pVatLine" style="display:none;justify-content:space-between;font-size:11.5px;color:var(--amber-dark);"><span>Satış KDV Dahil</span><b id="pVatIncl">0 ₺</b></div>
    </div>

    <button class="btn primary" onclick="H.guard(this, () => H.saveMedia('${campaignId}','${media ? media.id : ''}'))">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    const update = () => {
      const purchase = Number(sheet.querySelector('#fPurchase').value) || 0;
      const sales = Number(sheet.querySelector('#fSales').value) || 0;
      const pct = Number(sheet.querySelector('#fRistorno').value) || 0;
      const type = sheet.querySelector('#fMediaType').value;
      // §musteri-kdv: satış KDV dahil önizlemesi artık ayrı Satış KDV
      // alanını kullanıyor, mecra/alış KDV'sini değil.
      const salesVatRate = sheet.querySelector('#fSalesVat').value;
      const ristorno = purchase * (pct / 100);
      const net = calc.isTV(type) ? purchase : purchase - ristorno;
      const profit = sales - purchase + ristorno;
      sheet.querySelector('#pRistorno').textContent = fmt(ristorno);
      sheet.querySelector('#pNet').textContent = fmt(net);
      const profitEl = sheet.querySelector('#pProfit'); // absent for non-admin — see §roles above
      if (profitEl) profitEl.textContent = fmt(profit);
      const vatLine = sheet.querySelector('#pVatLine');
      const vatAmountLine = sheet.querySelector('#pVatAmountLine');
      if (salesVatRate) {
        vatLine.style.display = 'flex';
        vatAmountLine.style.display = 'flex';
        sheet.querySelector('#pVatIncl').textContent = fmt(calc.vatInclusive(sales, salesVatRate));
        sheet.querySelector('#pVatAmount').textContent = fmt(calc.vatAmount(sales, salesVatRate));
      } else {
        vatLine.style.display = 'none';
        vatAmountLine.style.display = 'none';
      }
    };
    ['fPurchase', 'fSales', 'fRistorno', 'fMediaType', 'fMediaVat', 'fSalesVat'].forEach((id) => {
      sheet.querySelector('#' + id).addEventListener('input', update);
      sheet.querySelector('#' + id).addEventListener('change', update);
    });

    // ---- §kalem-takip: Mecra Türü seçmeli/elle-yazma --------
    const typeSelect = sheet.querySelector('#fMediaTypeSelect');
    const typeManual = sheet.querySelector('#fMediaType');
    const manualHint = sheet.querySelector('#manualBackHint');
    const setResolvedType = (value) => {
      typeManual.value = value;
      typeManual.dispatchEvent(new Event('input', { bubbles: true }));
      typeManual.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const showEl = (el, display) => { el.style.display = display; };
    const hideEl = (el) => { el.style.display = 'none'; };

    // ---- §is-turu-birim: haftalık takip birimi artık İş Türü'nden geliyor -
    let kalemUnit = 'Hafta';
    const setKalemFlavor = (workTypeValue) => {
      const f = kalemFlavorForWorkType(workTypeValue);
      kalemUnit = f.unit;
      sheet.querySelector('#kalemTitle').innerHTML = `${icon(f.iconName, { size: 15 })} ${f.title}`;
    };
    const workTypeInput = sheet.querySelector('#fWorkType');
    setKalemFlavor(workTypeInput.value);
    workTypeInput.addEventListener('input', () => setKalemFlavor(workTypeInput.value));
    workTypeInput.addEventListener('change', () => setKalemFlavor(workTypeInput.value));

    // §yuklenici-secmeli: Mecra Türü değişince Yüklenici alanının datalist'i
    // (vendorListMedia) o türe göre yeniden dolduruluyor — TV/Radio seçilince
    // gerçek kanal listesi, diğer türlerde o türde daha önce girilenler.
    const vendorDatalistEl = sheet.querySelector('#vendorListMedia');
    const refreshVendorDatalist = async (type) => {
      if (!vendorDatalistEl) return;
      const opts = await repo.getVendorNamesForType((type || '').trim());
      vendorDatalistEl.innerHTML = opts.map((v) => `<option value="${escapeHtml(v)}">`).join('');
    };
    // §is-turu-tur-bazli: İş Türü de artık Yüklenici ile aynı desende, Mecra
    // Türü'ne göre dolan bir öneri listesi — o türde daha önce gerçekten
    // kullanılmış TÜM iş türlerini gösterir (3 sabit TV alt-türüyle sınırlı
    // değil), ama alan yine elle yazmaya açık serbest metin.
    const workTypeDatalistEl = sheet.querySelector('#workTypeList');
    const refreshWorkTypeDatalist = async (type) => {
      if (!workTypeDatalistEl) return;
      const opts = await repo.getWorkTypeNamesForType((type || '').trim());
      workTypeDatalistEl.innerHTML = opts.map((w) => `<option value="${escapeHtml(w)}">`).join('');
    };

    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === '__manual__') {
        hideEl(typeSelect);
        showEl(typeManual, '');
        showEl(manualHint, '');
        typeManual.value = '';
        typeManual.focus();
        typeManual.dispatchEvent(new Event('input', { bubbles: true }));
        refreshVendorDatalist('');
        refreshWorkTypeDatalist('');
      } else {
        setResolvedType(typeSelect.value);
        refreshVendorDatalist(typeSelect.value);
        refreshWorkTypeDatalist(typeSelect.value);
      }
    });
    typeManual.addEventListener('change', () => { refreshVendorDatalist(typeManual.value); refreshWorkTypeDatalist(typeManual.value); });
    const backLink = sheet.querySelector('#backToMediaList');
    if (backLink) {
      backLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideEl(typeManual);
        hideEl(manualHint);
        showEl(typeSelect, '');
        typeSelect.value = 'TV';
        setResolvedType('TV');
        refreshVendorDatalist('TV');
        refreshWorkTypeDatalist('TV');
      });
    }

    // ---- §kalem-takip / §kalem-satis: haftalık/adet/saniye kalem listesi,
    // her satırda ayrı Alış VE Satış tutarı ------------------------------
    const kalemItemsState = budgetItems.map((it) => ({ label: it.label, amount: Number(it.amount) || 0, salesAmount: Number(it.salesAmount) || 0 }));
    const kalemListEl = sheet.querySelector('#kalemList');
    const kalemBody = sheet.querySelector('#kalemBody');
    const budgetToggle = sheet.querySelector('#fBudgetEnabled');
    const purchaseEl = sheet.querySelector('#fPurchase');
    const salesEl = sheet.querySelector('#fSales');

    const syncKalemTotal = () => {
      const totalPurchase = kalemItemsState.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      const totalSales = kalemItemsState.reduce((s, it) => s + (Number(it.salesAmount) || 0), 0);
      sheet.querySelector('#kalemTotalVal').textContent = fmt(totalPurchase);
      sheet.querySelector('#kalemSalesTotalVal').textContent = fmt(totalSales);
      if (budgetToggle.checked) {
        purchaseEl.value = totalPurchase;
        purchaseEl.dispatchEvent(new Event('input', { bubbles: true }));
        salesEl.value = totalSales;
        salesEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    const renderKalemRows = () => {
      kalemListEl.innerHTML = kalemItemsState.map(kalemRowHtml).join('');
      Array.from(kalemListEl.querySelectorAll('.kalem-row')).forEach((row, idx) => {
        row.querySelector('.klabel').addEventListener('input', (e) => { kalemItemsState[idx].label = e.target.value; });
        row.querySelector('.kamount').addEventListener('input', (e) => { kalemItemsState[idx].amount = Number(e.target.value) || 0; syncKalemTotal(); });
        row.querySelector('.ksales').addEventListener('input', (e) => { kalemItemsState[idx].salesAmount = Number(e.target.value) || 0; syncKalemTotal(); });
        row.querySelector('.kdel').addEventListener('click', () => { kalemItemsState.splice(idx, 1); renderKalemRows(); syncKalemTotal(); });
      });
    };

    budgetToggle.addEventListener('change', () => {
      if (budgetToggle.checked) {
        showEl(kalemBody, '');
        purchaseEl.setAttribute('disabled', 'disabled');
        salesEl.setAttribute('disabled', 'disabled');
        if (kalemItemsState.length === 0) kalemItemsState.push({ label: '1. ' + kalemUnit, amount: 0, salesAmount: 0 });
        renderKalemRows();
        syncKalemTotal();
      } else {
        hideEl(kalemBody);
        purchaseEl.removeAttribute('disabled');
        salesEl.removeAttribute('disabled');
        update();
      }
    });
    sheet.querySelector('#kalemAddBtn').addEventListener('click', () => {
      kalemItemsState.push({ label: (kalemItemsState.length + 1) + '. ' + kalemUnit, amount: 0, salesAmount: 0 });
      renderKalemRows();
      syncKalemTotal();
      const rows = kalemListEl.querySelectorAll('.kamount');
      if (rows.length) rows[rows.length - 1].focus();
    });

    if (budgetOn && kalemUnit === 'Hafta') {
      // §is-turu-birim: birim üstte İş Türü'nden zaten belirlendi (Hafta ise
      // İş Türü bir ipucu vermedi demektir) — eski kayıtlarda İş Türü nötr
      // ("Reklam" gibi) olup kalem etiketleri "Adet"/"Saniye" ise geriye
      // dönük bu ipucu kullanılıyor, hiçbir eski kayıt bozulmuyor.
      const firstLabel = (kalemItemsState[0] && kalemItemsState[0].label || '').toLocaleLowerCase('tr-TR');
      if (firstLabel.includes('bant') || firstLabel.includes('adet')) setKalemFlavor('Banner');
      else if (firstLabel.includes('kuşak') || firstLabel.includes('saniye')) setKalemFlavor('Kuşak');
    }
    if (budgetOn) {
      renderKalemRows();
      syncKalemTotal();
    }

    update();
  });
}

export async function saveMedia(campaignId, mediaId) {
  const rawMediaType = document.getElementById('fMediaType').value.trim();
  const rawVendor = document.getElementById('fVendor').value.trim();
  const rawWorkType = document.getElementById('fWorkType').value.trim();
  // §birlesik-yazim: kaydedilmeden önce Mecra Türü/Yüklenici/İş Türü zaten
  // var olan bir yazımla (case/boşluk farkı göz ardı edilerek) eşleşiyorsa o
  // yazıma "snap" edilir — bundan sonraki her kayıt aynı çatı altında
  // birleşir, yeni bir yazım varyantı asla oluşmaz. Gerçekten yeni bir isimse
  // (eşleşme yoksa) elle yazılan hâliyle aynen kaydedilir.
  const [mediaType, vendor, workType] = await Promise.all([
    repo.canonicalMediaType(rawMediaType),
    repo.canonicalVendorName(rawVendor),
    repo.canonicalWorkType(rawWorkType)
  ]);

  // §kalem-takip: kalem takibi açıksa Alış Tutarı ekrandaki (otomatik
  // hesaplanmış, disabled) alandan değil, doğrudan kalem satırlarından
  // yeniden toplanır — ekranla veri arasında hiçbir tutarsızlık kalmaz.
  const budgetEnabled = document.getElementById('fBudgetEnabled').checked;
  const budgetItems = budgetEnabled
    ? Array.from(document.querySelectorAll('#kalemList .kalem-row')).map((row) => ({
        label: row.querySelector('.klabel').value.trim(),
        amount: Number(row.querySelector('.kamount').value) || 0,
        salesAmount: Number(row.querySelector('.ksales').value) || 0
      })).filter((it) => it.label || it.amount || it.salesAmount)
    : [];
  const purchase = budgetEnabled ? budgetItems.reduce((s, it) => s + it.amount, 0) : document.getElementById('fPurchase').value;
  const sales = budgetEnabled ? budgetItems.reduce((s, it) => s + it.salesAmount, 0) : document.getElementById('fSales').value;
  const ristornoPercent = document.getElementById('fRistorno').value;
  const vatRateRaw = document.getElementById('fMediaVat').value;
  const vatRate = vatRateRaw === '' ? null : Number(vatRateRaw);
  const salesVatRateRaw = document.getElementById('fSalesVat').value;
  const salesVatRate = salesVatRateRaw === '' ? null : Number(salesVatRateRaw);
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
    vatRate, salesVatRate,
    startDate, endDate, note,
    budgetEnabled, budgetItems
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
  if (!(await confirmDialog('Bu mecra kaydını silmek istiyor musun? Finansal geçmiş saklanır.'))) return;
  await repo.deleteMedia(mediaId);
  toast('Mecra kaydı silindi', 'success');
  navigate('/campaigns/' + campaignId);
}

// ============================================================================
// MECRA / YÜKLENİCİ KÜNYESİ (Vendor company profile) — §kunye
// Müşteri kartındaki künyenin birebir aynısı, sadece `vendors` deposundaki
// isim-bazlı kayda yazılıyor. Finans → Mecra Detayı'ndaki kalem simgesinden
// açılır.
// ============================================================================
export async function openVendorProfileForm(vendorName) {
  const profile = await repo.getVendorByName(vendorName);
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${escapeHtml(vendorName)} — Künye</h2>
    ${kunyeFieldsHtml(profile)}
    <button class="btn primary" onclick="H.guard(this, () => H.saveVendorProfile('${jsAttr(vendorName)}'))" style="margin-top:14px;">Kaydet</button>
  `;
  openSheet(html, () => {
    renderStampPreview();
  });
}

export async function saveVendorProfile(vendorName) {
  const data = readKunyeFields();
  try {
    const profile = await repo.resolveVendorProfile(vendorName);
    await repo.updateVendorProfile(profile.id, data);
    toast('Künye güncellendi', 'success');
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

// ============================================================================
// MECRA "+" — Yeni Mecra / Yüklenici (§mecra-hizli-ekle)
// Tek formda: Mecra Türü + Yüklenici (zorunlu) + künye (isteğe bağlı) + varsa
// ilk ticaret (Müşteri/Kampanya/İş Türü/Alış/Satış/KDV/Ristorno, isteğe
// bağlı — Yeni Kampanya'daki aynı "ya hepsi ya hiçbiri" mantığı). Ticaret
// girilirse kampanyanın içine, girilmezse yüklenicinin kendi Finans
// sayfasına gider — künye orada zaten görünür.
// ============================================================================
export async function openVendorQuickAddForm() {
  const [mediaTypes, clients] = await Promise.all([
    repo.getAllMediaTypeNames(), repo.getClients()
  ]);
  // §yuklenici-secmeli: bu form da (Mecralar sayfası "+") diğer ikisiyle
  // aynı Mecra Türü seçmeli/elle-yazma davranışını kullanıyor — burada TV
  // alt-türü (Sponsor/Banner/Kuşak) yok çünkü bu form kalem-kalem takip
  // içermiyor, sadece Mecra Türü select'i + Yüklenici/İş Türü'nün türe göre
  // dolan datalist'leri var.
  const [vendors, workTypes] = await Promise.all([
    repo.getVendorNamesForType('TV'),
    repo.getWorkTypeNamesForType('TV')
  ]);
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Yeni Mecra / Yüklenici</h2>
    <div class="field"><label>Mecra Türü *</label>
      <select id="fvMediaTypeSelect">
        ${repo.DEFAULT_MEDIA_TYPES.map((t) => `<option value="${escapeHtml(t)}" ${t === 'TV' ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        <option value="__manual__">✏️ Listede yok, elle yazacağım</option>
      </select>
      <input id="fvMediaType" list="fvMediaTypeList" placeholder="Mecra türünü yaz…" value="TV" style="display:none;">
      ${datalist('fvMediaTypeList', mediaTypes)}
      <div class="kalem-note" id="fvManualBackHint" style="display:none;">Listeye dönmek için <a href="#" id="fvBackToMediaList">buraya dokun</a></div>
    </div>
    <div class="field"><label>Yüklenici *</label>
      <input id="fvVendor" list="fvVendorList" placeholder="Örn: Show TV">
      ${datalist('fvVendorList', vendors)}
    </div>
    <div class="section-title" style="margin-top:4px;">Künye <span class="hint">(isteğe bağlı)</span></div>
    ${kunyeFieldsHtml(null)}
    <div class="detail-divider" style="margin:14px 0;"></div>
    <p class="hint" style="margin:0 0 10px;">${icon('landmark', { size: 13, className: 'icon-inline' })} İlk alışverişi de hemen kaydetmek istersen aşağıyı doldur, istemezsen boş bırak — sadece yüklenici + künye kaydedilir, ticareti daha sonra kampanya içinden eklersin.</p>
    <div class="field"><label>Müşteri</label>
      <input id="fvClient" list="fvClientList" placeholder="Var olan bir müşteri seç veya yeni yaz">
      ${datalist('fvClientList', clients.map((c) => c.name))}
    </div>
    <div class="field"><label>Kampanya Adı</label>
      <input id="fvCampaign" list="fvCampaignList" placeholder="Boş bırakılırsa müşteri adı kullanılır">
      ${datalist('fvCampaignList', [])}
    </div>
    <div class="field"><label>İş Türü</label>
      <input id="fvWorkType" list="fvWorkTypeList" placeholder="Reklam, Sponsorluk…">
      ${datalist('fvWorkTypeList', workTypes)}
    </div>
    <div class="row2">
      <div class="field"><label>Alış Tutarı <span class="hint">(KDV Hariç)</span></label><input id="fvPurchase" type="number" step="0.01"></div>
      <div class="field"><label>Satış Tutarı <span class="hint">(KDV Hariç)</span></label><input id="fvSales" type="number" step="0.01"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Ristorno %</label><input id="fvRistorno" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Alış KDV</label>
        <select id="fvVat">
          ${calc.VAT_RATES.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Satış KDV <span class="hint">(müşteriden farklı oranda tahsil ediyorsan)</span></label>
      <select id="fvSalesVat">
        ${calc.VAT_RATES.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}
      </select>
    </div>
    <button class="btn primary" onclick="H.guard(this, () => H.saveVendorQuickAdd())">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    renderStampPreview();
    const clientInput = sheet.querySelector('#fvClient');
    const campList = sheet.querySelector('#fvCampaignList');
    const refreshCampaigns = async () => {
      const match = clients.find((c) => c.name.trim().toLocaleLowerCase('tr-TR') === clientInput.value.trim().toLocaleLowerCase('tr-TR'));
      if (!match) { campList.innerHTML = ''; return; }
      const camps = await repo.getCampaignsForClient(match.id);
      campList.innerHTML = camps.map((c) => `<option value="${escapeHtml(c.name || c.productName)}">`).join('');
    };
    clientInput.addEventListener('input', refreshCampaigns);
    clientInput.addEventListener('change', refreshCampaigns);

    // ---- §yuklenici-secmeli: Mecra Türü seçmeli/elle-yazma (TV alt-türü
    // yok — bkz. yukarıdaki not) + Yüklenici'nin türe göre dolan datalist'i.
    const showEl = (el, display) => { el.style.display = display; };
    const hideEl = (el) => { el.style.display = 'none'; };
    const fvTypeSelect = sheet.querySelector('#fvMediaTypeSelect');
    const fvTypeManual = sheet.querySelector('#fvMediaType');
    const fvManualHint = sheet.querySelector('#fvManualBackHint');
    const fvVendorDatalistEl = sheet.querySelector('#fvVendorList');
    const refreshFvVendorDatalist = async (type) => {
      if (!fvVendorDatalistEl) return;
      const opts = await repo.getVendorNamesForType((type || '').trim());
      fvVendorDatalistEl.innerHTML = opts.map((v) => `<option value="${escapeHtml(v)}">`).join('');
    };
    const fvWorkTypeDatalistEl = sheet.querySelector('#fvWorkTypeList');
    const refreshFvWorkTypeDatalist = async (type) => {
      if (!fvWorkTypeDatalistEl) return;
      const opts = await repo.getWorkTypeNamesForType((type || '').trim());
      fvWorkTypeDatalistEl.innerHTML = opts.map((w) => `<option value="${escapeHtml(w)}">`).join('');
    };
    fvTypeSelect.addEventListener('change', () => {
      if (fvTypeSelect.value === '__manual__') {
        hideEl(fvTypeSelect);
        showEl(fvTypeManual, '');
        showEl(fvManualHint, '');
        fvTypeManual.value = '';
        fvTypeManual.focus();
        refreshFvVendorDatalist('');
        refreshFvWorkTypeDatalist('');
      } else {
        fvTypeManual.value = fvTypeSelect.value;
        refreshFvVendorDatalist(fvTypeSelect.value);
        refreshFvWorkTypeDatalist(fvTypeSelect.value);
      }
    });
    fvTypeManual.addEventListener('change', () => { refreshFvVendorDatalist(fvTypeManual.value); refreshFvWorkTypeDatalist(fvTypeManual.value); });
    const fvBackLink = sheet.querySelector('#fvBackToMediaList');
    if (fvBackLink) {
      fvBackLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideEl(fvTypeManual);
        hideEl(fvManualHint);
        showEl(fvTypeSelect, '');
        fvTypeSelect.value = 'TV';
        fvTypeManual.value = 'TV';
        refreshFvVendorDatalist('TV');
        refreshFvWorkTypeDatalist('TV');
      });
    }
  });
}

export async function saveVendorQuickAdd() {
  const rawMediaType = document.getElementById('fvMediaType').value.trim();
  const rawVendor = document.getElementById('fvVendor').value.trim();
  if (!rawMediaType) { toast('Mecra türü zorunlu', 'error'); return; }
  if (!rawVendor) { toast('Yüklenici zorunlu', 'error'); return; }
  // §birlesik-yazim: var olan yazıma snap edilir (bkz. saveMedia).
  const [mediaType, vendor] = await Promise.all([
    repo.canonicalMediaType(rawMediaType),
    repo.canonicalVendorName(rawVendor)
  ]);

  const kunye = readKunyeFields();
  const clientName = document.getElementById('fvClient').value.trim();
  let campaignName = document.getElementById('fvCampaign').value.trim();
  const rawWorkType = document.getElementById('fvWorkType').value.trim();
  const workType = await repo.canonicalWorkType(rawWorkType);
  const purchase = document.getElementById('fvPurchase').value;
  const sales = document.getElementById('fvSales').value;
  const ristornoPercent = document.getElementById('fvRistorno').value;
  const vatRateRaw = document.getElementById('fvVat').value;
  const salesVatRateRaw = document.getElementById('fvSalesVat').value;

  const tradeFilled = [clientName, workType, purchase, sales].some((v) => v !== '');
  const tradeComplete = clientName && workType && purchase !== '' && sales !== '';
  if (tradeFilled && !tradeComplete) {
    toast('İlk alışverişi kaydetmek istiyorsan Müşteri, İş Türü, Alış ve Satış tutarlarının hepsini gir (ya da hepsini boş bırak)', 'error');
    return;
  }

  try {
    await Promise.all([repo.addMediaTypeName(mediaType), repo.addVendorName(vendor)]);
    const profile = await repo.resolveVendorProfile(vendor);
    await repo.updateVendorProfile(profile.id, kunye);

    if (tradeComplete) {
      if (!campaignName) campaignName = clientName;
      const client = await resolveOrCreateClient(clientName);
      const campaign = await resolveOrCreateCampaign(client.id, campaignName);
      await repo.addWorkTypeName(workType);
      const vatRate = vatRateRaw === '' ? null : Number(vatRateRaw);
      const salesVatRate = salesVatRateRaw === '' ? null : Number(salesVatRateRaw);
      await repo.createMedia({
        campaignId: campaign.id,
        campaignName: campaign.name || campaign.productName,
        clientId: client.id, clientName: client.name, productId: campaign.productId,
        mediaType, vendor, workType,
        purchase: Number(purchase), sales: Number(sales), ristornoPercent: Number(ristornoPercent) || 0,
        vatRate, salesVatRate, startDate: '', endDate: '', note: ''
      });
      closeSheet();
      toast('Mecra ve kampanya kaydı eklendi', 'success');
      navigate('/campaigns/' + campaign.id);
    } else {
      closeSheet();
      toast('Yüklenici eklendi', 'success');
      navigate('/finance/vendor/' + encodeURIComponent(vendor));
    }
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

// ============================================================================
// FATURA / DEKONT (Invoice attachment) — §fatura-dekont
// Müşteri ve Mecra/Yüklenici finans kartlarında ortak — kestiğimiz veya
// aldığımız fatura/dekontu ekle/gör/sil. Çek deseninin sadeleştirilmiş
// hâli: hareket geçmişi yok, tek satırlık kayıt + fotoğraf(lar).
// entityType 'client' | 'vendor'; entityId müşteri için clientId, mecra
// için yüklenici adı (çek/ödeme'deki aynı "vendor adıyla eşleştirme" deseni).
// ============================================================================
let invoicePhotos = []; // transient dataURL[] — formPhotos ile aynı desen, ayrı değişken
// §fatura-hizli-ekle: Finans'ın genel "+" menüsünden (Fatura Ekle) açılan akış
// önce hangi müşteri/mecra, sonra hangi kampanya/hangi tahsilat-ödeme ile
// ilişkili olduğunu soruyor — bu ara adımların seçtiği bilgi, formu asıl açan
// openInvoiceForm'a bu transient üzerinden taşınıyor (stampPhoto/formPhotos
// ile aynı desen). Müşteri/mecra sayfasının kendi "+Ekle" bağlantısından
// (bağlam zaten belli) açıldığında bu adımlar atlanır, invoiceQuickCtx boş kalır.
let invoiceQuickCtx = {};
let invoiceStep2Campaigns = []; // transient — openInvoiceEntityStep2 -> confirmInvoiceStep2 arası kampanya listesi

function invoicePhotoSectionHtml() {
  return `
  <div class="field" style="margin-bottom:14px;">
    <label>${icon('image', { size: 14, className: 'icon-inline' })} Fatura / Dekont Fotoğrafı</label>
    <div class="photo-btns" id="invoicePhotoBtns">
      <button type="button" class="btn small outline" onclick="H.captureInvoicePhoto('camera')">${icon('camera', { size: 15, className: 'icon-inline' })} Kameradan Çek</button>
      <button type="button" class="btn small outline" onclick="H.captureInvoicePhoto('gallery')">${icon('image', { size: 15, className: 'icon-inline' })} Galeriden Seç</button>
    </div>
    <div id="invoicePhotoPreview"></div>
  </div>`;
}

function renderInvoicePhotoPreview() {
  const wrap = document.getElementById('invoicePhotoPreview');
  const btns = document.getElementById('invoicePhotoBtns');
  if (!wrap) return;
  wrap.innerHTML = photoStripHtml(invoicePhotos, {
    onRemove: (i) => `H.removeInvoicePhoto(${i})`,
    onView: (src) => `H.viewPhotoDataUrl('${src}')`,
    max: MAX_PHOTOS
  });
  if (btns) btns.style.display = invoicePhotos.length >= MAX_PHOTOS ? 'none' : 'flex';
}

export async function captureInvoicePhoto(source) {
  if (invoicePhotos.length >= MAX_PHOTOS) { toast(`En fazla ${MAX_PHOTOS} fotoğraf eklenebilir`, 'error'); return; }
  const dataUrl = await pickPhoto(source);
  if (dataUrl) {
    invoicePhotos.push(dataUrl);
    renderInvoicePhotoPreview();
  }
}

export function removeInvoicePhoto(index) {
  invoicePhotos.splice(index, 1);
  renderInvoicePhotoPreview();
}

// Finans "+" → Fatura Ekle'nin giriş noktası. `ctx.clientId`/`ctx.vendor`
// zaten biliniyorsa (o müşteri/mecranın sayfasındaysan) doğrudan 2. adıma
// (kampanya/ilgili kayıt seçimi) geçer; ikisi de boşsa önce Müşteri mi Mecra
// mı diye sorar.
export async function openInvoiceQuickAdd(ctx = {}) {
  if (ctx.clientId) {
    const client = await repo.getClient(ctx.clientId);
    return openInvoiceEntityStep2('client', ctx.clientId, client ? client.name : '');
  }
  if (ctx.vendor) {
    return openInvoiceEntityStep2('vendor', ctx.vendor, ctx.vendor);
  }
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Fatura / Dekont Ekle</h2>
    <p class="hint" style="margin-bottom:10px;">Hangisi için?</p>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.openInvoicePickEntity('client')"><span class="ico">${icon('users', { size: 18 })}</span>Müşteri</button>
      <button class="action-item" onclick="H.openInvoicePickEntity('vendor')"><span class="ico">${icon('monitor', { size: 18 })}</span>Mecra / Yüklenici</button>
    </div>
  `;
  openSheet(html);
}

export async function openInvoicePickEntity(kind) {
  if (kind === 'client') {
    const clients = await repo.getClients();
    const html = `
      <button class="close-x" onclick="H.closeSheet()">✕</button>
      <h2>Hangi Müşteri?</h2>
      <div class="field"><label>Müşteri</label>
        <input id="fInvEntityName" list="fInvEntityList" placeholder="Müşteri adı yaz veya seç">
        ${datalist('fInvEntityList', clients.map((c) => c.name))}
      </div>
      <button class="btn primary" onclick="H.guard(this, () => H.confirmInvoiceEntity('client'))">Devam Et</button>
    `;
    openSheet(html);
  } else {
    const vendors = await repo.getAllVendorNames();
    const html = `
      <button class="close-x" onclick="H.closeSheet()">✕</button>
      <h2>Hangi Mecra / Yüklenici?</h2>
      <div class="field"><label>Yüklenici</label>
        <input id="fInvEntityName" list="fInvEntityList" placeholder="Yüklenici adı yaz veya seç">
        ${datalist('fInvEntityList', vendors)}
      </div>
      <button class="btn primary" onclick="H.guard(this, () => H.confirmInvoiceEntity('vendor'))">Devam Et</button>
    `;
    openSheet(html);
  }
}

export async function confirmInvoiceEntity(kind) {
  const name = document.getElementById('fInvEntityName').value.trim();
  if (!name) { toast(kind === 'client' ? 'Müşteri adını yaz' : 'Yüklenici adını yaz', 'error'); return; }
  if (kind === 'client') {
    const client = await resolveOrCreateClient(name);
    return openInvoiceEntityStep2('client', client.id, client.name);
  }
  await repo.addVendorName(name);
  return openInvoiceEntityStep2('vendor', name, name);
}

// Fatura akışının 2. adımı: bu müşteri/mecra için isteğe bağlı olarak hangi
// kampanya (iş) ve hangi tahsilat/ödeme kaydıyla ilişkili olduğunu sor —
// ikisi de boş bırakılabilir, genel bir fatura olarak kaydedilir.
async function openInvoiceEntityStep2(entityType, entityId, entityLabel) {
  let campaigns = [];
  let records = [];
  if (entityType === 'client') {
    [campaigns, records] = await Promise.all([
      repo.getCampaignsForClient(entityId),
      repo.getCollectionsForClient(entityId)
    ]);
  } else {
    const [data, payments] = await Promise.all([
      agg.getVendorAggregate(entityId),
      repo.getPaymentsForVendor(entityId)
    ]);
    campaigns = data.campaigns.map((c) => c.campaign);
    records = payments;
  }
  // §fatura-elle-yaz: liste boşsa (ör. bu müşteri/mecra için henüz hiç
  // kampanya/tahsilat/ödeme kaydı yoksa) ya da aradığın kayıt listede yoksa
  // artık seçmeli kutunun altında her zaman bir "elle yaz" alanı da var —
  // select boş bırakılırsa bu metin kullanılır, doldurulursa select'teki
  // gerçek kayıt öncelikli sayılır.
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${escapeHtml(entityLabel)}</h2>
    <div class="field"><label>Hangi İş / Kampanya <span class="hint">(isteğe bağlı)</span></label>
      <select id="fInvCampaignSel">
        <option value="">Seçme (genel fatura)</option>
        ${campaigns.map((c) => `<option value="${c.id}">${escapeHtml(c.name || c.productName)}</option>`).join('')}
      </select>
      <input id="fInvCampaignManual" placeholder="Listede yoksa iş/kampanya adını buraya elle yaz" style="margin-top:6px;">
    </div>
    <div class="field"><label>Hangi ${entityType === 'client' ? 'Tahsilat' : 'Ödeme'} İçin <span class="hint">(isteğe bağlı)</span></label>
      <select id="fInvRelatedSel">
        <option value="">Seçme</option>
        ${records.map((r) => `<option value="${r.id}">${formatDate(r.date)} · ${fmt(r.amount)}${r.campaignName ? ' · ' + escapeHtml(r.campaignName) : ''}</option>`).join('')}
      </select>
      <input id="fInvRelatedManual" placeholder="Listede yoksa hangi ${entityType === 'client' ? 'tahsilat' : 'ödeme'} olduğunu buraya elle yaz" style="margin-top:6px;">
    </div>
    <button class="btn primary" onclick="H.guard(this, () => H.confirmInvoiceStep2('${entityType}','${jsAttr(entityId)}','${jsAttr(entityLabel)}'))">Devam Et</button>
  `;
  openSheet(html, () => {
    invoiceStep2Campaigns = campaigns;
  });
}

export async function confirmInvoiceStep2(entityType, entityId, entityLabel) {
  const campaignId = document.getElementById('fInvCampaignSel').value || '';
  const campaignManual = document.getElementById('fInvCampaignManual').value.trim();
  const relatedId = document.getElementById('fInvRelatedSel').value || '';
  const relatedManual = document.getElementById('fInvRelatedManual').value.trim();
  const campaigns = invoiceStep2Campaigns;
  const campaign = campaignId ? campaigns.find((c) => c.id === campaignId) : null;
  // §fatura-elle-yaz: select'te gerçek bir kayıt seçildiyse o öncelikli —
  // seçilmediyse (liste boştu ya da aranan kayıt yoktu) elle yazılan metin
  // kullanılır. relatedNote sadece elle yazılan durumda dolar; relatedId hep
  // gerçek bir kayda işaret eder ya da tamamen boştur.
  invoiceQuickCtx = {
    campaignId,
    campaignName: campaign ? (campaign.name || campaign.productName) : campaignManual,
    relatedId,
    relatedNote: relatedId ? '' : relatedManual,
    relatedType: entityType === 'client' ? 'collection' : 'payment'
  };
  closeSheet();
  openInvoiceForm(entityType, entityId, null);
}

export async function openInvoiceForm(entityType, entityId, invoiceId) {
  const existing = invoiceId ? await repo.getInvoice(invoiceId) : null;
  invoicePhotos = existing && existing.photos ? existing.photos.slice() : [];
  const direction = existing ? existing.direction : 'kesilen';
  const campaignName = existing ? (existing.campaignName || '') : (invoiceQuickCtx.campaignName || '');
  if (!existing) {
    // Yeni fatura: quick-add adımlarında seçilen bağlam kullanılacak, kaydettikten
    // sonra sıfırlanır (aşağıda saveInvoice'da). Doğrudan bir müşteri/mecra
    // sayfasının "+Ekle" bağlantısından açıldıysa invoiceQuickCtx zaten boştur.
  } else {
    // Var olan bir faturayı düzenlerken kendi kayıtlı bağlamını kullan.
    invoiceQuickCtx = { campaignId: existing.campaignId || '', campaignName: existing.campaignName || '', relatedId: existing.relatedId || '', relatedNote: existing.relatedNote || '', relatedType: existing.relatedType || '' };
  }

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${existing ? 'Fatura / Dekontu Düzenle' : 'Fatura / Dekont Ekle'}</h2>
    ${campaignName ? `<p class="hint" style="margin-bottom:10px;">${icon('megaphone', { size: 13, className: 'icon-inline' })} ${escapeHtml(campaignName)}</p>` : ''}
    <div class="field"><label>Yön</label>
      <select id="fInvDirection">
        <option value="kesilen" ${direction === 'kesilen' ? 'selected' : ''}>Kestiğimiz Fatura</option>
        <option value="alinan" ${direction === 'alinan' ? 'selected' : ''}>Aldığımız Fatura / Dekont</option>
      </select>
    </div>
    <div class="row2">
      <div class="field"><label>Fatura / Dekont No</label><input id="fInvNo" value="${existing && existing.no ? escapeHtml(existing.no) : ''}"></div>
      <div class="field"><label>Tarih</label><input id="fInvDate" type="date" value="${existing && existing.date ? existing.date : todayISO()}"></div>
    </div>
    <div class="field"><label>Tutar</label><input id="fInvAmount" type="number" step="0.01" value="${existing && existing.amount != null ? existing.amount : ''}"></div>
    <div class="field">${noteFieldHtml('fInvNote', existing && existing.note ? existing.note : '')}</div>
    ${invoicePhotoSectionHtml()}
    <button class="btn primary" onclick="H.guard(this, () => H.saveInvoice('${entityType}','${jsAttr(entityId)}','${existing ? existing.id : ''}'))">Kaydet</button>
    ${existing ? `<button class="btn danger" onclick="H.deleteInvoiceUI('${existing.id}')">Sil</button>` : ''}
  `;
  openSheet(html, () => {
    renderInvoicePhotoPreview();
  });
}

export async function saveInvoice(entityType, entityId, invoiceId) {
  const direction = document.getElementById('fInvDirection').value;
  const no = document.getElementById('fInvNo').value.trim();
  const date = document.getElementById('fInvDate').value || '';
  const amountRaw = document.getElementById('fInvAmount').value;
  const amount = amountRaw === '' ? null : Number(amountRaw);
  const note = document.getElementById('fInvNote').value.trim();

  const data = {
    entityType, entityId,
    direction, no, date, amount, note,
    campaignId: invoiceQuickCtx.campaignId || '',
    campaignName: invoiceQuickCtx.campaignName || '',
    relatedId: invoiceQuickCtx.relatedId || '',
    relatedNote: invoiceQuickCtx.relatedNote || '',
    relatedType: invoiceQuickCtx.relatedType || '',
    photos: invoicePhotos.slice()
  };
  try {
    if (invoiceId) {
      await repo.updateInvoiceRecord(invoiceId, data);
      toast('Fatura/dekont güncellendi', 'success');
    } else {
      await repo.createInvoiceRecord(data);
      toast('Fatura/dekont eklendi', 'success');
    }
    invoicePhotos = [];
    invoiceQuickCtx = {};
    closeSheet();
    // Kaydedilen kaydı hemen görebilsin diye o müşterinin/mecranın kendi
    // Finans sayfasına götür (§fatura-hizli-ekle) — farklı bir Finans
    // sayfasından hızlı eklenmiş olsa bile.
    if (entityType === 'client') navigate('/customers/' + entityId);
    else navigate('/finance/vendor/' + encodeURIComponent(entityId));
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteInvoiceUI(invoiceId) {
  if (!(await confirmDialog('Bu fatura/dekont kaydını silmek istiyor musun?'))) return;
  await repo.deleteInvoiceRecord(invoiceId);
  toast('Fatura/dekont silindi', 'success');
  closeSheet();
  refresh();
}

// ============================================================================
// cheque sub-fields shared by collection + payment forms
// ============================================================================
// Tahsilat (Collection) side: a received cheque is *born* here — enter its
// physical details directly. `linked` (optional) prefills these when
// editing an existing tahsilat that already has a cheque attached.
function chequeFieldsHtml(linked) {
  return `
  <div class="payment-group" id="chequeGroup" style="display:none;">
    <div class="payment-group-title">${icon('receipt', { size: 15, className: 'icon-inline' })} Çek Bilgileri</div>
    <div class="row2">
      <div class="field"><label>Çek Tarihi</label><input id="fChequeDate" type="date" value="${linked && linked.chequeDate ? linked.chequeDate : todayISO()}"></div>
      <div class="field"><label>Vade Tarihi *</label><input id="fChequeDue" type="date" value="${linked && linked.dueDate ? linked.dueDate : ''}"></div>
    </div>
    <div class="row2" style="margin-bottom:0;">
      <div class="field" style="margin-bottom:0;"><label>Banka</label><input id="fChequeBank" placeholder="Banka adı" value="${linked ? escapeHtml(linked.bank || '') : ''}"></div>
      <div class="field" style="margin-bottom:0;"><label>Çek No</label><input id="fChequeNo" placeholder="Çek numarası" value="${linked ? escapeHtml(linked.chequeNumber || '') : ''}"></div>
    </div>
  </div>`;
}

// Ödeme (Payment) side: a "verilen çek" is never freshly self-issued — it is
// always an existing held/received cheque being used (ciro edilir). This
// renders a picker over currently-unused cheques (plus, when editing, the
// cheque already linked to this payment) instead of fresh-entry fields.
function chequeUseFieldsHtml(pickList, selectedId) {
  if (!pickList || pickList.length === 0) {
    return `
    <div class="payment-group" id="chequeUseGroup" style="display:none;">
      <div class="payment-group-title">${icon('receipt', { size: 15, className: 'icon-inline' })} Kullanılacak Çek</div>
      <p class="hint">Elinde kullanılmamış çek yok. Önce bir müşteriden çek tahsil et.</p>
    </div>`;
  }
  return `
  <div class="payment-group" id="chequeUseGroup" style="display:none;">
    <div class="payment-group-title">${icon('receipt', { size: 15, className: 'icon-inline' })} Kullanılacak Çek</div>
    <div class="field" style="margin-bottom:0;">
      <label>Elindeki Çeklerden Seç *</label>
      <select id="fChequeUsePick">
        <option value="">Seç…</option>
        ${pickList.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${fmt(c.amount)} — ${escapeHtml(c.counterpartyName || '—')} — Vade ${formatDate(c.dueDate)}</option>`).join('')}
      </select>
    </div>
    <p class="hint-note" id="chequeUsePreview" style="font-size:10.5px;color:var(--ink-soft);margin:8px 0 0;font-style:italic;"></p>
  </div>`;
}

function vadeliFieldsHtml() {
  return `
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

function wirePaymentTypeToggle(sheet, dateFieldId, opts = {}) {
  const chequeGroupId = opts.chequeGroupId || 'chequeGroup';
  const sel = sheet.querySelector('#fPayType');
  const chequeGroup = sheet.querySelector('#' + chequeGroupId);
  const vadeliGroup = sheet.querySelector('#vadeliGroup');
  const toggle = () => {
    const v = sel.value;
    if (chequeGroup) chequeGroup.style.display = v === 'Çek' ? 'block' : 'none';
    if (vadeliGroup) vadeliGroup.style.display = v === 'Vadeli' ? 'block' : 'none';
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
  return { toggle, sel };
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
  const existing = ctx.collectionId ? await repo.getCollection(ctx.collectionId) : null;
  const linkedCheque = existing && existing.chequeId ? await repo.getCheque(existing.chequeId) : null;
  formPhotos = existing && existing.photos ? existing.photos.slice() : [];

  const clientId = existing ? existing.clientId : ctx.clientId;
  const campaignId = existing ? existing.campaignId : ctx.campaignId;
  // §çek-varsayılan: yeni tahsilat açılışında Çek önden seçili gelsin —
  // çek alanları ilk açılışta görünür olsun, kullanıcı Nakit/Havale seçerse
  // wirePaymentTypeToggle zaten gizliyor (mevcut mantık).
  const paymentType = existing ? existing.paymentType : (ctx.presetPaymentType || 'Çek');

  const clients = await repo.getClients();
  const campaigns = clientId ? await repo.getCampaignsForClient(clientId) : [];
  const clientObj = clientId ? clients.find((c) => c.id === clientId) : null;
  const campaignObj = campaignId ? campaigns.find((c) => c.id === campaignId) : null;

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${existing ? 'Tahsilatı Düzenle' : 'Tahsilat Ekle'}</h2>
    <div class="field"><label>Müşteri *</label>
      <input id="fColClient" list="fColClientList" placeholder="Var olan bir müşteri seç veya yeni bir isim yaz" value="${clientObj ? escapeHtml(clientObj.name) : ''}">
      ${datalist('fColClientList', clients.map((c) => c.name))}
    </div>
    <div class="field"><label>Kampanya *</label>
      <input id="fColCampaign" list="fColCampaignList" placeholder="Var olan bir kampanya seç veya yeni bir isim yaz" value="${campaignObj ? escapeHtml(campaignObj.name || campaignObj.productName) : ''}">
      ${datalist('fColCampaignList', campaigns.map((c) => c.name || c.productName))}
    </div>
    <div class="row2">
      <div class="field"><label>Tarih *</label><input id="fColDate" type="date" value="${existing ? existing.date : todayISO()}"></div>
      <div class="field"><label>Tutar *</label><input id="fColAmount" type="number" step="0.01" value="${existing ? existing.amount : ''}" placeholder="0"></div>
    </div>
    <div class="field"><label>Ödeme Türü *</label>
      <select id="fPayType">
        ${repo.PAYMENT_TYPES.map((t) => `<option value="${t}" ${paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    ${chequeFieldsHtml(linkedCheque)}
    ${vadeliFieldsHtml()}
    ${photoSectionHtml()}
    <div class="field">${noteFieldHtml('fColNote', existing ? existing.note : '')}</div>
    <button class="btn primary" onclick="H.guard(this, () => H.saveCollection('${existing ? existing.id : ''}'))">Kaydet</button>
  `;

  openSheet(html, (sheet) => {
    wirePaymentTypeToggle(sheet, 'fColDate');
    if (formPhotos.length) renderFormPhotoPreview();
    if (existing && existing.paymentType === 'Vadeli' && existing.dueDate && existing.date) {
      const el = sheet.querySelector('#fVadeliDays');
      if (el) {
        el.value = daysBetween(existing.date, existing.dueDate);
        el.dispatchEvent(new Event('input'));
      }
    }
    const clientInput = sheet.querySelector('#fColClient');
    const campInput = sheet.querySelector('#fColCampaign');
    const campList = sheet.querySelector('#fColCampaignList');
    const reloadCampaigns = async () => {
      const match = clients.find((c) => c.name.trim().toLocaleLowerCase('tr-TR') === clientInput.value.trim().toLocaleLowerCase('tr-TR'));
      if (!match) { campList.innerHTML = ''; return; }
      const camps = await repo.getCampaignsForClient(match.id);
      campList.innerHTML = camps.map((c) => `<option value="${escapeHtml(c.name || c.productName)}">`).join('');
    };
    clientInput.addEventListener('input', reloadCampaigns);
    clientInput.addEventListener('change', reloadCampaigns);
  });
}

export async function saveCollection(collectionId) {
  const clientNameInput = document.getElementById('fColClient').value.trim();
  const campaignNameInput = document.getElementById('fColCampaign').value.trim();
  const date = document.getElementById('fColDate').value;
  const amount = document.getElementById('fColAmount').value;
  const paymentType = document.getElementById('fPayType').value;
  const note = document.getElementById('fColNote').value.trim();

  if (!clientNameInput) { toast('Müşteri adını seç veya yaz', 'error'); return; }
  if (!campaignNameInput) { toast('Kampanya adını seç veya yaz', 'error'); return; }
  if (!date) { toast('Tarih zorunlu', 'error'); return; }
  if (amount === '' || Number(amount) < 0) { toast('Geçerli bir tutar gir', 'error'); return; }

  const client = await resolveOrCreateClient(clientNameInput);
  const campaign = await resolveOrCreateCampaign(client.id, campaignNameInput);
  const clientId = client.id;
  const campaignId = campaign.id;
  const campaignName = campaign.name || campaign.productName;

  const existing = collectionId ? await repo.getCollection(collectionId) : null;
  const existingCheque = existing && existing.chequeId ? await repo.getCheque(existing.chequeId) : null;

  // A cheque that already has a movement history can't silently lose its
  // cheque just because the payment type changed on this form — send the
  // user to undo the movement(s) first (§cheque-redesign: keep the
  // cheque/payment link consistent instead of leaving a dangling reference).
  if (existingCheque && existingCheque.movements && existingCheque.movements.length && paymentType !== 'Çek') {
    toast('Bu çeğin hareket geçmişi var. Önce çek sayfasından son hareketi geri al.', 'error');
    return;
  }

  try {
    let chequeId = existing ? existing.chequeId : null;
    if (paymentType === 'Çek') {
      const dueDate = document.getElementById('fChequeDue').value;
      if (!dueDate) { toast('Çek vade tarihi zorunlu', 'error'); return; }
      const chequeData = {
        direction: 'received',
        counterpartyName: client.name,
        campaignId, campaignName,
        // §73: stamp clientId (when known) so this cheque surfaces on the
        // Customer/Campaign detail pages, not just Finans→Çekler.
        clientId: clientId || null,
        chequeDate: document.getElementById('fChequeDate').value || date,
        dueDate,
        bank: document.getElementById('fChequeBank').value.trim(),
        chequeNumber: document.getElementById('fChequeNo').value.trim(),
        amount: Number(amount),
        photos: formPhotos.slice()
      };
      if (chequeId) {
        await repo.updateCheque(chequeId, chequeData);
        // Keep every already-endorsed payment in this cheque's history in
        // sync with a corrected cheque amount, so none of them drift apart.
        const vendorMoves = existingCheque && existingCheque.movements ? existingCheque.movements.filter((m) => m.toType === 'vendor' && m.paymentId) : [];
        for (const m of vendorMoves) {
          await repo.updatePayment(m.paymentId, { amount: Number(amount) });
        }
      } else {
        const created = await repo.createCheque({ ...chequeData, status: null, note: '' });
        chequeId = created.id;
      }
    } else if (chequeId) {
      // Type changed away from Çek on an unused cheque (guard above already
      // blocked this when the cheque was in use) — it no longer applies.
      await repo.deleteCheque(chequeId);
      chequeId = null;
    }

    const dueDate = readVadeliDueDate(date);
    const data = {
      clientId, clientName: client ? client.name : '',
      campaignId, campaignName,
      date, amount: Number(amount), paymentType, note,
      chequeId, dueDate,
      photos: formPhotos.slice()
    };
    if (collectionId) {
      await repo.updateCollection(collectionId, data);
      toast('Tahsilat güncellendi', 'success');
    } else {
      await repo.createCollection(data);
      toast('Tahsilat eklendi', 'success');
    }
    formPhotos = [];
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteCollection(collectionId) {
  const col = await repo.getCollection(collectionId);
  const cheque = col && col.chequeId ? await repo.getCheque(col.chequeId) : null;
  const movements = cheque ? (cheque.movements || []) : [];
  const vendorMoves = movements.filter((m) => m.toType === 'vendor' && m.paymentId);
  let msg = 'Bu tahsilatı silmek istiyor musun?';
  if (movements.length) msg = `Bu çeğin ${movements.length} hareketlik bir geçmişi var — silersen tüm geçmişi${vendorMoves.length ? ' ve bağlı ödeme kayıtlarını' : ''} da silinecek. ` + msg;
  if (!(await confirmDialog(msg))) return;
  for (const m of vendorMoves) {
    await repo.deletePayment(m.paymentId);
  }
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
  const existing = ctx.paymentId ? await repo.getPayment(ctx.paymentId) : null;
  formPhotos = existing && existing.photos ? existing.photos.slice() : [];

  const clientId = existing ? existing.clientId : ctx.clientId;
  const campaignId = existing ? existing.campaignId : ctx.campaignId;
  const vendorPreset = existing ? existing.vendor : ctx.vendor;
  // §çek-varsayılan: yeni ödeme açılışında Çek önden seçili gelsin.
  const paymentType = existing ? existing.paymentType : (ctx.presetPaymentType || 'Çek');
  const selectedChequeId = existing ? existing.chequeId : (ctx.presetChequeId || null);

  const clients = await repo.getClients();
  const campaigns = clientId ? await repo.getCampaignsForClient(clientId) : [];
  const vendors = await repo.getAllVendorNames();
  const clientObj = clientId ? clients.find((c) => c.id === clientId) : null;
  const campaignObj = campaignId ? campaigns.find((c) => c.id === campaignId) : null;

  // Pick-list for "Çek" type: every currently-held (unused) cheque, plus —
  // when editing a payment that's already using one, or when arriving here
  // from a specific cheque's own "Ciro Et" action (§cheque-redesign v2: a
  // cheque with movement history can still be handed to a vendor next — the
  // chain isn't limited to cheques that have never moved) — that cheque
  // itself, even though it no longer counts as "held".
  const held = await repo.getHeldCheques();
  let pickList = held;
  if (existing && existing.chequeId) {
    const linked = await repo.getCheque(existing.chequeId);
    if (linked && !pickList.some((c) => c.id === linked.id)) pickList = [linked, ...pickList];
  } else if (selectedChequeId) {
    const preset = await repo.getCheque(selectedChequeId);
    if (preset && !pickList.some((c) => c.id === preset.id)) pickList = [preset, ...pickList];
  }

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${existing ? 'Ödemeyi Düzenle' : 'Ödeme Ekle'}</h2>
    <div class="field"><label>Müşteri *</label>
      <input id="fPayClient" list="fPayClientList" placeholder="Var olan bir müşteri seç veya yeni bir isim yaz" value="${clientObj ? escapeHtml(clientObj.name) : ''}">
      ${datalist('fPayClientList', clients.map((c) => c.name))}
    </div>
    <div class="field"><label>Kampanya *</label>
      <input id="fPayCampaign" list="fPayCampaignList" placeholder="Var olan bir kampanya seç veya yeni bir isim yaz" value="${campaignObj ? escapeHtml(campaignObj.name || campaignObj.productName) : ''}">
      ${datalist('fPayCampaignList', campaigns.map((c) => c.name || c.productName))}
    </div>
    <div class="field"><label>Yüklenici *</label>
      <input id="fPayVendor" list="vendorListPay" placeholder="Yüklenici seç veya yaz — listede yoksa yeni bir isim de yazabilirsin" value="${vendorPreset ? escapeHtml(vendorPreset) : ''}">
      ${datalist('vendorListPay', vendors)}
    </div>
    <div class="row2">
      <div class="field"><label>Tarih *</label><input id="fPayDate" type="date" value="${existing ? existing.date : todayISO()}"></div>
      <div class="field"><label>Tutar *</label><input id="fPayAmount" type="number" step="0.01" value="${existing ? existing.amount : ''}" placeholder="0"></div>
    </div>
    <div class="field"><label>Ödeme Türü *</label>
      <select id="fPayType">
        ${repo.PAYMENT_TYPES.map((t) => `<option value="${t}" ${paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    ${chequeUseFieldsHtml(pickList, selectedChequeId)}
    ${vadeliFieldsHtml()}
    ${photoSectionHtml()}
    <div class="field">${noteFieldHtml('fPayNote', existing ? existing.note : '')}</div>
    <button class="btn primary" onclick="H.guard(this, () => H.savePayment('${existing ? existing.id : ''}'))">Kaydet</button>
  `;

  openSheet(html, (sheet) => {
    wirePaymentTypeToggle(sheet, 'fPayDate', { chequeGroupId: 'chequeUseGroup' });
    if (formPhotos.length) renderFormPhotoPreview();
    if (existing && existing.paymentType === 'Vadeli' && existing.dueDate && existing.date) {
      const el = sheet.querySelector('#fVadeliDays');
      if (el) {
        el.value = daysBetween(existing.date, existing.dueDate);
        el.dispatchEvent(new Event('input'));
      }
    }

    // Çek type: picking a held cheque fills & locks the amount to that
    // cheque's own amount (a cheque is always used whole, never split).
    const amountInput = sheet.querySelector('#fPayAmount');
    const chequePick = sheet.querySelector('#fChequeUsePick');
    const chequePreview = sheet.querySelector('#chequeUsePreview');
    const typeSel = sheet.querySelector('#fPayType');
    const syncChequeAmount = () => {
      const picked = pickList.find((c) => c.id === (chequePick ? chequePick.value : ''));
      if (picked) {
        amountInput.value = picked.amount;
        amountInput.readOnly = true;
        if (chequePreview) chequePreview.textContent = `Banka: ${picked.bank || '—'} · No: ${picked.chequeNumber || '—'} · Çek Tarihi: ${formatDate(picked.chequeDate)}`;
      } else {
        if (chequePreview) chequePreview.textContent = '';
      }
    };
    if (chequePick) chequePick.addEventListener('change', syncChequeAmount);
    typeSel.addEventListener('change', () => {
      if (typeSel.value === 'Çek') syncChequeAmount();
      else amountInput.readOnly = false;
    });
    if (paymentType === 'Çek') syncChequeAmount();

    const clientInput = sheet.querySelector('#fPayClient');
    const campInput = sheet.querySelector('#fPayCampaign');
    const campList = sheet.querySelector('#fPayCampaignList');
    const reloadCampaigns = async () => {
      const match = clients.find((c) => c.name.trim().toLocaleLowerCase('tr-TR') === clientInput.value.trim().toLocaleLowerCase('tr-TR'));
      if (!match) { campList.innerHTML = ''; return; }
      const camps = await repo.getCampaignsForClient(match.id);
      campList.innerHTML = camps.map((c) => `<option value="${escapeHtml(c.name || c.productName)}">`).join('');
    };
    clientInput.addEventListener('input', reloadCampaigns);
    clientInput.addEventListener('change', reloadCampaigns);
  });
}

export async function savePayment(paymentId) {
  const clientNameInput = document.getElementById('fPayClient').value.trim();
  const campaignNameInput = document.getElementById('fPayCampaign').value.trim();
  const rawVendor = document.getElementById('fPayVendor').value.trim();
  const date = document.getElementById('fPayDate').value;
  const paymentType = document.getElementById('fPayType').value;
  const note = document.getElementById('fPayNote').value.trim();

  if (!clientNameInput) { toast('Müşteri adını seç veya yaz', 'error'); return; }
  if (!campaignNameInput) { toast('Kampanya adını seç veya yaz', 'error'); return; }
  if (!rawVendor) { toast('Yüklenici seçmelisin', 'error'); return; }
  // §birlesik-yazim: var olan yazıma snap edilir (bkz. saveMedia).
  const vendor = await repo.canonicalVendorName(rawVendor);
  if (!date) { toast('Tarih zorunlu', 'error'); return; }

  const existing = paymentId ? await repo.getPayment(paymentId) : null;
  const prevChequeId = existing ? existing.chequeId : null;
  const prevMovementId = existing ? existing.chequeMovementId : null;

  let chequeId = null;
  let amount;
  if (paymentType === 'Çek') {
    chequeId = document.getElementById('fChequeUsePick').value;
    if (!chequeId) { toast('Kullanılacak çeki seç', 'error'); return; }
    const usedCheque = await repo.getCheque(chequeId);
    if (!usedCheque) { toast('Seçili çek bulunamadı', 'error'); return; }
    amount = Number(usedCheque.amount);
  } else {
    const amountRaw = document.getElementById('fPayAmount').value;
    if (amountRaw === '' || Number(amountRaw) < 0) { toast('Geçerli bir tutar gir', 'error'); return; }
    amount = Number(amountRaw);
  }

  const client = await resolveOrCreateClient(clientNameInput);
  const campaign = await resolveOrCreateCampaign(client.id, campaignNameInput);
  const clientId = client.id;
  const campaignId = campaign.id;
  const campaignName = campaign.name || campaign.productName;

  try {
    const dueDate = readVadeliDueDate(date);
    await repo.addVendorName(vendor);

    // §cheque-redesign v2: a payment doesn't own a single cheque "state" —
    // it owns ONE specific entry (by id) in that cheque's movement history,
    // which may no longer be the last entry (the cheque could have moved on
    // again since). Track by id, never by array position.
    let chequeMovementId = (prevChequeId && prevChequeId === chequeId) ? prevMovementId : null;
    if (prevChequeId && prevMovementId && prevChequeId !== chequeId) {
      await repo.removeChequeMovementById(prevChequeId, prevMovementId);
    }

    const data = {
      clientId, clientName: client ? client.name : '',
      campaignId, campaignName, vendor,
      date, amount, paymentType, note,
      chequeId, chequeMovementId, dueDate,
      photos: formPhotos.slice()
    };
    let saved;
    if (paymentId) {
      saved = await repo.updatePayment(paymentId, data);
      toast('Ödeme güncellendi', 'success');
    } else {
      saved = await repo.createPayment(data);
      toast('Ödeme eklendi', 'success');
    }

    if (chequeId) {
      const movement = { toType: 'vendor', toVendor: vendor, toCampaignId: campaignId, toCampaignName: campaignName, date, paymentId: saved.id };
      if (chequeMovementId) {
        await repo.updateChequeMovementById(chequeId, chequeMovementId, movement);
      } else {
        const entry = await repo.appendChequeMovement(chequeId, movement);
        await repo.updatePayment(saved.id, { chequeMovementId: entry.id });
      }
    }

    formPhotos = [];
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deletePayment(paymentId) {
  if (!(await confirmDialog('Bu ödemeyi silmek istiyor musun?'))) return;
  const pay = await repo.getPayment(paymentId);
  await repo.deletePayment(paymentId);
  if (pay && pay.chequeId && pay.chequeMovementId) {
    // The cheque itself isn't tied to this payment's existence — it was
    // born from its own tahsilat — so deleting the endorsement just
    // removes that one movement from the cheque's history (falling back to
    // whoever/wherever held it before), never the cheque itself.
    await repo.removeChequeMovementById(pay.chequeId, pay.chequeMovementId);
  }
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
    <button class="btn small outline" style="width:100%;margin-bottom:8px;" onclick="H.closeSheet();H.${kind === 'collection' ? 'openCollectionForm' : 'openPaymentForm'}({${kind === 'collection' ? 'collectionId' : 'paymentId'}:'${rec.id}'})">${icon('pencil', { size: 14, className: 'icon-inline' })} Düzenle</button>
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
      <button class="action-item" onclick="H.quickNewCampaign()"><span class="ico">${icon('megaphone', { size: 18 })}</span>Yeni Kampanya</button>
      <button class="action-item" onclick="H.closeSheet();H.openCollectionForm({})"><span class="ico">${icon('banknote', { size: 18 })}</span>Tahsilat Ekle</button>
      <button class="action-item" onclick="H.closeSheet();H.openPaymentForm({})"><span class="ico">${icon('landmark', { size: 18 })}</span>Ödeme Ekle</button>
      <button class="action-item" onclick="H.quickNewCheque()"><span class="ico">${icon('receipt', { size: 18 })}</span>Çek Ekle</button>
    </div>
  `;
  openSheet(html);
}

// ============================================================================
// FİNANS "+" — Finans'ın neresinde olursan ol aynı 4 seçenek: Tahsilat /
// Ödeme / Çek / Fatura Ekle. `ctx.clientId` / `ctx.vendor` verilirse (o
// müşteri/mecranın sayfasındaysan) Tahsilat/Ödeme/Fatura o kayda önceden
// dolu açılır; verilmezse (genel Finans sayfaları) boş açılır.
// ============================================================================
export function openFinanceQuickAddMenu(ctx = {}) {
  const clientId = ctx.clientId || '';
  const vendor = ctx.vendor || '';
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Finans İşlemi Ekle</h2>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.closeSheet();H.openCollectionForm({clientId:'${jsAttr(clientId)}'})"><span class="ico">${icon('banknote', { size: 18 })}</span>Tahsilat Ekle</button>
      <button class="action-item" onclick="H.closeSheet();H.openPaymentForm({vendor:'${jsAttr(vendor)}'})"><span class="ico">${icon('landmark', { size: 18 })}</span>Ödeme Ekle</button>
      <button class="action-item" onclick="H.quickNewCheque()"><span class="ico">${icon('receipt', { size: 18 })}</span>Çek Ekle</button>
      <button class="action-item" onclick="H.closeSheet();H.openInvoiceQuickAdd({clientId:'${jsAttr(clientId)}', vendor:'${jsAttr(vendor)}'})"><span class="ico">${icon('receipt', { size: 18 })}</span>Fatura Ekle</button>
    </div>
  `;
  openSheet(html);
}

// §hizli-ekle-serbest-yazim: bu ikili (quickNewProduct/quickNewCampaign),
// müşteri/ürün alanlarını daha önce SADECE var olanlar arasından seçilebilen
// <select> olarak gösteriyordu — kullanıcı yeni bir isim yazmaya çalıştığında
// hiçbir şey olmuyordu (native <select> yazılan harfe atlar, serbest metin
// kabul etmez), bu da "elle yazamıyorum" şikayetine yol açtı. Artık uygulamanın
// geri kalanındaki Mecra Türü/Yüklenici/İş Türü alanlarıyla aynı desen: bir
// <input list="..."> — var olan bir ismi seçebilirsin YA DA hiç var olmayan
// yeni bir isim yazabilirsin; yeni yazılan isim onaylayınca otomatik oluşturulur.
async function resolveOrCreateClient(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const clients = await repo.getClients();
  const existing = clients.find((c) => c.name.trim().toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR'));
  if (existing) return existing;
  return repo.createClient({ name: trimmed });
}

async function resolveOrCreateProduct(clientId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const products = await repo.getProductsForClient(clientId);
  const existing = products.find((p) => p.name.trim().toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR'));
  if (existing) return existing;
  return repo.createProduct({ clientId, name: trimmed });
}

// Tahsilat / Ödeme / Yeni Mecra Kaydı formlarındaki Kampanya alanı da aynı
// serbest-yazım desenine kavuşuyor (§hizli-ekle-tum-alanlar). Bir kampanya
// normalde bir ürün + başlangıç/bitiş tarihiister — burada elle hızlı kayıt
// sırasında bunları sormak akışı kilitler, bu yüzden yazılan isim var olan
// bir kampanyayla eşleşmezse: aynı isimle bir ürün de otomatik bul/oluştur,
// başlangıcı bugün / bitişi 30 gün sonrası olan bir kampanya yarat. Tarihler
// yanlışsa kullanıcı Kampanya Detayı'ndaki kalem simgesiyle (openCampaignForm)
// saniyeler içinde düzeltebilir — hiçbir alan "girilemez" kalmıyor.
async function resolveOrCreateCampaign(clientId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const campaigns = await repo.getCampaignsForClient(clientId);
  const existing = campaigns.find((c) => (c.name || c.productName || '').trim().toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR'));
  if (existing) return existing;
  const client = await repo.getClient(clientId);
  const product = await resolveOrCreateProduct(clientId, trimmed);
  const startDate = todayISO();
  const endDate = addDays(startDate, 30);
  return repo.createCampaign({
    clientId, productId: product.id,
    clientName: client ? client.name : '',
    productName: product.name,
    name: trimmed,
    startDate, endDate, note: ''
  });
}

export async function quickNewProduct() {
  const clients = await repo.getClients();
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Hangi Müşteri İçin?</h2>
    <div class="field"><label>Müşteri</label>
      <input id="qpClient" list="qpClientList" placeholder="Var olan bir müşteri seç veya yeni bir isim yaz">
      ${datalist('qpClientList', clients.map((c) => c.name))}
    </div>
    <button class="btn primary" onclick="H.guard(this, () => H.quickNewProductConfirm())">Devam Et</button>
  `;
  openSheet(html);
}

export async function quickNewProductConfirm() {
  const name = document.getElementById('qpClient').value.trim();
  if (!name) { toast('Müşteri adını seç veya yaz', 'error'); return; }
  const client = await resolveOrCreateClient(name);
  closeSheet();
  openProductForm(client.id);
}

// §tek-tuslu-kampanya: eski akış (Müşteri/Ürün seç → boş Kampanya formu aç)
// kullanıcıyı sayfa sayfa dolaştırıyordu. Artık tek sheet'te müşteri, ürün,
// kampanya adı VE isteğe bağlı olarak ilk mecra/yüklenici kaydı (mecra türü,
// yüklenici, iş türü, alış, satış, KDV, ristorno) tek seferde girilip TEK
// dokunuşla kaydediliyor — hiçbir alan zorunlu değil (Müşteri hariç), boş
// bırakılan mecra alanları varsa kampanya mecrasız oluşur, daha sonra
// Kampanya Detayı'ndan eklenebilir/silinebilir (mevcut yetenek, değişmedi).
export async function quickNewCampaign() {
  const [clients, mediaTypes] = await Promise.all([
    repo.getClients(), repo.getAllMediaTypeNames()
  ]);
  // §yuklenici-secmeli: bu form her zaman "TV" varsayılanıyla açılıyor —
  // Yüklenici önerileri de o türe göre (TV kanalları) doldurulur, Mecra Türü
  // değişince aşağıdaki refreshQcVendorDatalist ile yeniden doldurulur.
  // §is-turu-tur-bazli: İş Türü önerileri de aynı desende, tür bazlı.
  const [vendors, workTypes] = await Promise.all([
    repo.getVendorNamesForType('TV'),
    repo.getWorkTypeNamesForType('TV')
  ]);
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Yeni Kampanya</h2>
    <div class="field"><label>Müşteri *</label>
      <input id="qcClient" list="qcClientList" placeholder="Var olan bir müşteri seç veya yeni bir isim yaz">
      ${datalist('qcClientList', clients.map((c) => c.name))}
    </div>
    <div class="field"><label>Ürün</label>
      <input id="qcProduct" list="qcProductList" placeholder="Boş bırakılırsa kampanya adı kullanılır">
      ${datalist('qcProductList', [])}
    </div>
    <div class="field"><label>Kampanya Adı</label>
      <input id="qcCampName" placeholder="Boş bırakılırsa ürün adı kullanılır">
    </div>
    <div class="detail-divider" style="margin:12px 0;"></div>
    <p class="hint" style="margin:0 0 10px;">${icon('monitor', { size: 13, className: 'icon-inline' })} İstersen ilk mecra/yüklenici kaydını da hemen ekle — istemezsen boş bırak, kampanyanın içinden daha sonra eklersin.</p>
    <div class="field"><label>Mecra Türü</label>
      <select id="qcMediaTypeSelect">
        ${repo.DEFAULT_MEDIA_TYPES.map((t) => `<option value="${escapeHtml(t)}" ${t === 'TV' ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        <option value="__manual__">✏️ Listede yok, elle yazacağım</option>
      </select>
      <input id="qcMediaType" list="qcMediaTypeList" placeholder="Mecra türünü yaz…" value="TV" style="display:none;">
      ${datalist('qcMediaTypeList', mediaTypes)}
      <div class="kalem-note" id="qcManualBackHint" style="display:none;">Listeye dönmek için <a href="#" id="qcBackToMediaList">buraya dokun</a></div>
    </div>
    <div class="field"><label>İş Türü</label>
      <input id="qcWorkType" list="qcWorkTypeList" placeholder="Reklam, Sponsorluk…">
      ${datalist('qcWorkTypeList', workTypes)}
    </div>
    <div class="field"><label>Yüklenici</label>
      <input id="qcVendor" list="qcVendorList" placeholder="Örn: Show TV">
      ${datalist('qcVendorList', vendors)}
    </div>

    <div class="kalem-section">
      <div class="kalem-toggle-row">
        <span class="ktitle" id="qcKalemTitle">${icon('calendar', { size: 15 })} Haftalık Takip</span>
        <label class="switch">
          <input type="checkbox" id="qcBudgetEnabled">
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>
      <div id="qcKalemBody" style="display:none;">
        <div class="kalem-note">Alış ve Satış Tutarları bu kalemlerin toplamından otomatik hesaplanır.</div>
        <div class="kalem-col-labels"><span class="kcl-label"></span><span class="kcl-amount">Alış</span><span class="kcl-amount">Satış</span><span class="kcl-del"></span></div>
        <div class="kalem-list" id="qcKalemList"></div>
        <button class="kalem-add" id="qcKalemAddBtn" type="button">+ Kalem Ekle</button>
        <div class="kalem-total-row">
          <div class="kalem-total"><span>Alış</span><b id="qcKalemTotalVal">0 ₺</b></div>
          <div class="kalem-total"><span>Satış</span><b id="qcKalemSalesTotalVal">0 ₺</b></div>
        </div>
      </div>
    </div>

    <div class="row2">
      <div class="field"><label>Alış Tutarı <span class="hint">(KDV Hariç)</span></label><input id="qcPurchase" type="number" step="0.01"></div>
      <div class="field"><label>Satış Tutarı <span class="hint">(KDV Hariç)</span></label><input id="qcSales" type="number" step="0.01"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Ristorno %</label><input id="qcRistorno" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Alış KDV</label>
        <select id="qcVat">
          ${calc.VAT_RATES.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Satış KDV <span class="hint">(müşteriden farklı oranda tahsil ediyorsan)</span></label>
      <select id="qcSalesVat">
        ${calc.VAT_RATES.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}
      </select>
    </div>
    <button class="btn primary" onclick="H.guard(this, () => H.quickNewCampaignConfirm())">Kaydet</button>
  `;
  openSheet(html, (sheet) => {
    // Müşteri alanı, listedeki bir isimle TAM eşleşince (mevcut müşteri
    // seçildiğinde) o müşterinin ürünlerini Ürün datalist'ine dolduruyor.
    // Hiç eşleşmezse (yeni/henüz yazılmakta olan bir isimse) ürün listesi
    // boşalır — zaten yeni bir müşterinin henüz ürünü olamaz.
    const clientInput = sheet.querySelector('#qcClient');
    const productList = sheet.querySelector('#qcProductList');
    const refreshProducts = async () => {
      const match = clients.find((c) => c.name.trim().toLocaleLowerCase('tr-TR') === clientInput.value.trim().toLocaleLowerCase('tr-TR'));
      if (!match) { productList.innerHTML = ''; return; }
      const products = await repo.getProductsForClient(match.id);
      productList.innerHTML = products.map((p) => `<option value="${escapeHtml(p.name)}">`).join('');
    };
    clientInput.addEventListener('input', refreshProducts);
    clientInput.addEventListener('change', refreshProducts);

    // ---- §kalem-takip (Ana Sayfa hızlı kampanya formu): openMediaForm ile
    // AYNI Mecra Türü seçmeli/elle-yazma davranışı — burada da `hidden`
    // attribute'u DEĞİL, .style.display kullanılıyor (bkz. openMediaForm'daki
    // aynı not). ---------------------------------------------------------
    const showEl = (el, display) => { el.style.display = display; };
    const hideEl = (el) => { el.style.display = 'none'; };

    const qcTypeSelect = sheet.querySelector('#qcMediaTypeSelect');
    const qcTypeManual = sheet.querySelector('#qcMediaType');
    const qcManualHint = sheet.querySelector('#qcManualBackHint');

    // §is-turu-birim: openMediaForm'daki setKalemFlavor ile birebir aynı
    // desen — haftalık takip birimi artık İş Türü'nden geliyor.
    let qcKalemUnit = 'Hafta';
    const setQcKalemFlavor = (workTypeValue) => {
      const f = kalemFlavorForWorkType(workTypeValue);
      qcKalemUnit = f.unit;
      sheet.querySelector('#qcKalemTitle').innerHTML = `${icon(f.iconName, { size: 15 })} ${f.title}`;
    };
    const qcWorkTypeInput = sheet.querySelector('#qcWorkType');
    setQcKalemFlavor(qcWorkTypeInput.value);
    qcWorkTypeInput.addEventListener('input', () => setQcKalemFlavor(qcWorkTypeInput.value));
    qcWorkTypeInput.addEventListener('change', () => setQcKalemFlavor(qcWorkTypeInput.value));

    // §yuklenici-secmeli: openMediaForm'daki refreshVendorDatalist ile
    // birebir aynı desen — Mecra Türü değişince Yüklenici datalist'i o türe
    // göre yeniden dolar.
    const qcVendorDatalistEl = sheet.querySelector('#qcVendorList');
    const refreshQcVendorDatalist = async (type) => {
      if (!qcVendorDatalistEl) return;
      const opts = await repo.getVendorNamesForType((type || '').trim());
      qcVendorDatalistEl.innerHTML = opts.map((v) => `<option value="${escapeHtml(v)}">`).join('');
    };
    // §is-turu-tur-bazli: openMediaForm'daki refreshWorkTypeDatalist ile
    // birebir aynı desen.
    const qcWorkTypeDatalistEl = sheet.querySelector('#qcWorkTypeList');
    const refreshQcWorkTypeDatalist = async (type) => {
      if (!qcWorkTypeDatalistEl) return;
      const opts = await repo.getWorkTypeNamesForType((type || '').trim());
      qcWorkTypeDatalistEl.innerHTML = opts.map((w) => `<option value="${escapeHtml(w)}">`).join('');
    };

    qcTypeSelect.addEventListener('change', () => {
      if (qcTypeSelect.value === '__manual__') {
        hideEl(qcTypeSelect);
        showEl(qcTypeManual, '');
        showEl(qcManualHint, '');
        qcTypeManual.value = '';
        qcTypeManual.focus();
        refreshQcVendorDatalist('');
        refreshQcWorkTypeDatalist('');
      } else {
        qcTypeManual.value = qcTypeSelect.value;
        refreshQcVendorDatalist(qcTypeSelect.value);
        refreshQcWorkTypeDatalist(qcTypeSelect.value);
      }
    });
    qcTypeManual.addEventListener('change', () => { refreshQcVendorDatalist(qcTypeManual.value); refreshQcWorkTypeDatalist(qcTypeManual.value); });
    sheet.querySelector('#qcBackToMediaList').addEventListener('click', (e) => {
      e.preventDefault();
      hideEl(qcTypeManual);
      hideEl(qcManualHint);
      showEl(qcTypeSelect, '');
      qcTypeSelect.value = 'TV';
      qcTypeManual.value = 'TV';
      refreshQcVendorDatalist('TV');
      refreshQcWorkTypeDatalist('TV');
    });

    // ---- kalem kalem (haftalık/adet/saniye) listesi, Alış + Satış ----------
    let qcKalemItems = [];
    const qcKalemListEl = sheet.querySelector('#qcKalemList');
    const qcKalemBody = sheet.querySelector('#qcKalemBody');
    const qcBudgetToggle = sheet.querySelector('#qcBudgetEnabled');
    const qcPurchaseEl = sheet.querySelector('#qcPurchase');
    const qcSalesEl = sheet.querySelector('#qcSales');

    const syncQcKalemTotal = () => {
      const totalPurchase = qcKalemItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      const totalSales = qcKalemItems.reduce((s, it) => s + (Number(it.salesAmount) || 0), 0);
      sheet.querySelector('#qcKalemTotalVal').textContent = fmt(totalPurchase);
      sheet.querySelector('#qcKalemSalesTotalVal').textContent = fmt(totalSales);
      if (qcBudgetToggle.checked) {
        qcPurchaseEl.value = totalPurchase;
        qcSalesEl.value = totalSales;
      }
    };
    const renderQcKalemRows = () => {
      qcKalemListEl.innerHTML = qcKalemItems.map(kalemRowHtml).join('');
      Array.from(qcKalemListEl.querySelectorAll('.kalem-row')).forEach((row, idx) => {
        row.querySelector('.klabel').addEventListener('input', (e) => { qcKalemItems[idx].label = e.target.value; });
        row.querySelector('.kamount').addEventListener('input', (e) => { qcKalemItems[idx].amount = Number(e.target.value) || 0; syncQcKalemTotal(); });
        row.querySelector('.ksales').addEventListener('input', (e) => { qcKalemItems[idx].salesAmount = Number(e.target.value) || 0; syncQcKalemTotal(); });
        row.querySelector('.kdel').addEventListener('click', () => { qcKalemItems.splice(idx, 1); renderQcKalemRows(); syncQcKalemTotal(); });
      });
    };
    qcBudgetToggle.addEventListener('change', () => {
      if (qcBudgetToggle.checked) {
        showEl(qcKalemBody, '');
        qcPurchaseEl.setAttribute('disabled', 'disabled');
        qcSalesEl.setAttribute('disabled', 'disabled');
        if (qcKalemItems.length === 0) qcKalemItems.push({ label: '1. ' + qcKalemUnit, amount: 0, salesAmount: 0 });
        renderQcKalemRows();
        syncQcKalemTotal();
      } else {
        hideEl(qcKalemBody);
        qcPurchaseEl.removeAttribute('disabled');
        qcSalesEl.removeAttribute('disabled');
      }
    });
    sheet.querySelector('#qcKalemAddBtn').addEventListener('click', () => {
      qcKalemItems.push({ label: (qcKalemItems.length + 1) + '. ' + qcKalemUnit, amount: 0, salesAmount: 0 });
      renderQcKalemRows();
      syncQcKalemTotal();
      const rows = qcKalemListEl.querySelectorAll('.kamount');
      if (rows.length) rows[rows.length - 1].focus();
    });
  });
}

export async function quickNewCampaignConfirm() {
  const clientName = document.getElementById('qcClient').value.trim();
  let productName = document.getElementById('qcProduct').value.trim();
  let campName = document.getElementById('qcCampName').value.trim();
  const rawMediaType = document.getElementById('qcMediaType').value.trim();
  const rawVendor = document.getElementById('qcVendor').value.trim();
  const rawWorkType = document.getElementById('qcWorkType').value.trim();
  // §birlesik-yazim: var olan yazıma snap edilir (bkz. saveMedia).
  const [mediaType, vendor, workType] = await Promise.all([
    repo.canonicalMediaType(rawMediaType),
    repo.canonicalVendorName(rawVendor),
    repo.canonicalWorkType(rawWorkType)
  ]);
  // §kalem-takip: kalem takibi açıksa Alış Tutarı ekrandaki (otomatik
  // hesaplanmış, disabled) alandan değil, doğrudan kalem satırlarından
  // yeniden toplanır — openMediaForm/saveMedia ile birebir aynı desen.
  const budgetEnabled = document.getElementById('qcBudgetEnabled').checked;
  const budgetItems = budgetEnabled
    ? Array.from(document.querySelectorAll('#qcKalemList .kalem-row')).map((row) => ({
        label: row.querySelector('.klabel').value.trim(),
        amount: Number(row.querySelector('.kamount').value) || 0,
        salesAmount: Number(row.querySelector('.ksales').value) || 0
      })).filter((it) => it.label || it.amount || it.salesAmount)
    : [];
  const purchase = budgetEnabled ? String(budgetItems.reduce((s, it) => s + it.amount, 0)) : document.getElementById('qcPurchase').value;
  const sales = budgetEnabled ? String(budgetItems.reduce((s, it) => s + it.salesAmount, 0)) : document.getElementById('qcSales').value;
  const ristornoPercent = document.getElementById('qcRistorno').value;
  const vatRateRaw = document.getElementById('qcVat').value;
  const salesVatRateRaw = document.getElementById('qcSalesVat').value;

  if (!clientName) { toast('Müşteri adını seç veya yaz', 'error'); return; }
  // Kampanya adı / ürün adı birbirinden türetilebilir — ikisi de boşsa kaydet
  // deyince ilerlemesin, en az biri girilsin (openCampaignForm'daki gibi).
  if (!productName && !campName) { toast('Ürün adı veya kampanya adı yaz', 'error'); return; }
  if (!productName) productName = campName;
  if (!campName) campName = '';

  // §kalem-takip: Mecra Türü artık select olduğu için HER ZAMAN bir değeri
  // var (varsayılan TV) — "mecra hiç doldurulmadı" tespitini artık mediaType
  // üzerinden değil, gerçekten kullanıcı girişi gerektiren alanlar üzerinden
  // yapıyoruz; yoksa sırf salt kampanya eklemek isteyen biri select'in
  // varsayılanı yüzünden "mecrayı tamamla" uyarısı alırdı. Mecra alanları ya
  // HİÇ doldurulmamış (kampanya mecrasız oluşur) ya da gereken alanlar
  // (yüklenici/iş türü/alış/satış) TAMAMEN dolu olmalı — yarım kalan bir
  // mecra kaydı sessizce kaybolmasın.
  const mediaFilled = [vendor, workType, purchase, sales].some((v) => v !== '');
  const mediaComplete = vendor && workType && purchase !== '' && sales !== '';
  if (mediaFilled && !mediaComplete) {
    toast('Mecra eklemek istiyorsan Yüklenici, İş Türü, Alış ve Satış tutarlarının hepsini gir (ya da hepsini boş bırak)', 'error');
    return;
  }

  const client = await resolveOrCreateClient(clientName);
  const product = await resolveOrCreateProduct(client.id, productName);
  const startDate = todayISO();
  const endDate = addDays(startDate, 30);
  const campaign = await repo.createCampaign({
    clientId: client.id, productId: product.id,
    clientName: client.name, productName: product.name,
    name: campName, startDate, endDate, note: ''
  });

  if (mediaComplete) {
    const vatRate = vatRateRaw === '' ? null : Number(vatRateRaw);
    const salesVatRate = salesVatRateRaw === '' ? null : Number(salesVatRateRaw);
    await Promise.all([repo.addMediaTypeName(mediaType), repo.addVendorName(vendor), repo.addWorkTypeName(workType)]);
    await repo.createMedia({
      campaignId: campaign.id,
      campaignName: campaign.name || campaign.productName,
      clientId: client.id, clientName: client.name, productId: product.id,
      mediaType, vendor, workType,
      purchase: Number(purchase), sales: Number(sales), ristornoPercent: Number(ristornoPercent) || 0,
      vatRate, salesVatRate, startDate: '', endDate: '', note: '',
      budgetEnabled, budgetItems
    });
  }

  closeSheet();
  toast('Kampanya eklendi', 'success');
  navigate('/campaigns/' + campaign.id);
}

// §nav-redesign: "Mecralar" area's real "add" action — a new mecra/vendor
// record always belongs to a specific campaign, so this asks Müşteri →
// Kampanya, then opens the actual mecra form. Reached from the Mecralar
// page's own "+" (see openMecraQuickAddMenu below).
export async function quickNewMediaRecord() {
  const clients = await repo.getClients();
  const firstClientCampaigns = clients.length ? await repo.getCampaignsForClient(clients[0].id) : [];
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Hangi Kampanya İçin?</h2>
    <div class="field"><label>Müşteri</label>
      <input id="qmClient" list="qmClientList" placeholder="Var olan bir müşteri seç veya yeni bir isim yaz">
      ${datalist('qmClientList', clients.map((c) => c.name))}
    </div>
    <div class="field"><label>Kampanya</label>
      <input id="qmCampaign" list="qmCampaignList" placeholder="Var olan bir kampanya seç veya yeni bir isim yaz">
      ${datalist('qmCampaignList', firstClientCampaigns.map((c) => c.name || c.productName))}
    </div>
    <button class="btn primary" onclick="H.guard(this, () => H.quickNewMediaRecordConfirm())">Devam Et</button>
  `;
  openSheet(html, (sheet) => {
    const clientInput = sheet.querySelector('#qmClient');
    const campList = sheet.querySelector('#qmCampaignList');
    const refreshCampaigns = async () => {
      const match = clients.find((c) => c.name.trim().toLocaleLowerCase('tr-TR') === clientInput.value.trim().toLocaleLowerCase('tr-TR'));
      if (!match) { campList.innerHTML = ''; return; }
      const camps = await repo.getCampaignsForClient(match.id);
      campList.innerHTML = camps.map((c) => `<option value="${escapeHtml(c.name || c.productName)}">`).join('');
    };
    clientInput.addEventListener('input', refreshCampaigns);
    clientInput.addEventListener('change', refreshCampaigns);
    if (clients.length) clientInput.value = clients[0].name;
  });
}

export async function quickNewMediaRecordConfirm() {
  const clientName = document.getElementById('qmClient').value.trim();
  const campaignName = document.getElementById('qmCampaign').value.trim();
  if (!clientName) { toast('Müşteri adını seç veya yaz', 'error'); return; }
  if (!campaignName) { toast('Kampanya adını seç veya yaz', 'error'); return; }
  const client = await resolveOrCreateClient(clientName);
  const campaign = await resolveOrCreateCampaign(client.id, campaignName);
  closeSheet();
  openMediaForm(campaign.id);
}

// Mecralar / Finans→Mecra page's "+" — was wrongly bound straight to a blank
// "Ödeme Ekle" (§nav-redesign bug report). Both real actions for this area
// live here now, picked explicitly instead of guessed.
export function openMecraQuickAddMenu() {
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Mecra İşlemi</h2>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.closeSheet();H.quickNewMediaRecord()"><span class="ico">${icon('monitor', { size: 18 })}</span>Yeni Mecra Kaydı</button>
      <button class="action-item" onclick="H.closeSheet();H.openPaymentForm({})"><span class="ico">${icon('landmark', { size: 18 })}</span>Ödeme Ekle</button>
    </div>
  `;
  openSheet(html);
}

// Kampanya Detayı sayfasının FAB'ı — bu kampanyaya (ve müşterisine) önceden
// dolu Tahsilat/Ödeme seçimi (§nav-redesign). Kampanya sayfasının kendi "+"ı
// zaten Mecra Ekle'ye bağlı; bu, para hareketi tarafını hızlandırıyor.
export function openCampaignQuickAddMenu(clientId, campaignId) {
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Hızlı İşlem</h2>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.closeSheet();H.openCollectionForm({clientId:'${clientId}',campaignId:'${campaignId}'})"><span class="ico">${icon('arrowDownCircle', { size: 18 })}</span>Tahsilat Ekle</button>
      <button class="action-item" onclick="H.closeSheet();H.openCampaignPaymentPicker('${clientId}','${campaignId}')"><span class="ico">${icon('landmark', { size: 18 })}</span>Ödeme Ekle</button>
    </div>
  `;
  openSheet(html);
}

// §bugfix-vendor-mixup: the campaign-level "Ödeme Ekle" entry points (this
// FAB menu, and the combined "Mecra Hesabı" card on Campaign Detail) used to
// open the payment form with an EMPTY vendor field — that card shows every
// vendor's remaining balance summed together, so nothing there told the user
// which specific vendor they were about to pay. If a campaign had more than
// one mecra (e.g. ATV + Star TV) and the user picked/typed the wrong name, a
// payment meant for one vendor got silently booked against another — looking
// like the app was "moving money between vendors" when really it was just an
// ambiguous, unscoped form. Now: 0 vendors falls back to the old blank form,
// exactly 1 vendor is preset automatically (no extra tap needed), and 2+
// vendors get an explicit picker naming each one — never a guess.
export async function openCampaignPaymentPicker(clientId, campaignId) {
  const media = await repo.getMediaForCampaign(campaignId);
  const vendors = [...new Set(media.filter((m) => !m.deleted).map((m) => m.vendor))];
  if (vendors.length === 0) {
    openPaymentForm({ clientId, campaignId });
    return;
  }
  if (vendors.length === 1) {
    openPaymentForm({ clientId, campaignId, vendor: vendors[0] });
    return;
  }
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Hangi Mecraya Ödeme?</h2>
    <p class="hint" style="margin-top:-6px;">Bu kampanyada birden fazla mecra var — yanlış mecraya yazılmasın diye önce seçmen gerekiyor.</p>
    <div class="action-sheet-list">
      ${vendors.map((v) => `<button class="action-item" onclick="H.closeSheet();H.openPaymentForm({clientId:'${clientId}',campaignId:'${campaignId}',vendor:'${jsAttr(v)}'})"><span class="ico">${icon('landmark', { size: 18 })}</span>${escapeHtml(v)}</button>`).join('')}
    </div>
  `;
  openSheet(html);
}

// §cheque-redesign: a cheque is always born as "alınan" from a tahsilat —
// there's no more "verilen çek" entry point here, since giving/endorsing a
// cheque onward always starts from an existing held cheque (see
// openChequeUseForm, reached from the cheque's own detail page).
export function quickNewCheque() {
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Çek İşlemi</h2>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.closeSheet();H.openCollectionForm({presetPaymentType:'Çek'})"><span class="ico">${icon('arrowDownCircle', { size: 18 })}</span>Yeni Çek Al (Tahsilat)</button>
      <button class="action-item" onclick="H.closeSheet();H.goto('/finance/cheques')"><span class="ico">${icon('receipt', { size: 18 })}</span>Elimdeki Çekleri Kullan / Ciro Et</button>
    </div>
  `;
  openSheet(html);
}

// ============================================================================
// ÇEK HAREKETLERİ (§cheque-redesign v2) — a cheque's custody trail is a full
// history, not one "current state": it can be handed to a vendor, taken
// back, handed to a customer, taken back, handed to the bank, etc., any
// number of times. Every handoff is its own `movements` entry; only the
// LAST one is editable/undoable (older history stays a permanent record).
// ============================================================================
export function openChequeUseForm(chequeId) {
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Bu Çeki Kime/Nereye Verdin?</h2>
    <div class="action-sheet-list">
      <button class="action-item" onclick="H.closeSheet();H.openPaymentForm({presetPaymentType:'Çek',presetChequeId:'${chequeId}'})"><span class="ico">${icon('landmark', { size: 18 })}</span>Bir Yükleniciye/Mecraya Öde (Ciro Et)</button>
      <button class="action-item" onclick="H.openChequeGiveToClientForm('${chequeId}')"><span class="ico">${icon('users', { size: 18 })}</span>Bir Müşteriye Ver</button>
      <button class="action-item" onclick="H.openChequeMarkOtherForm('${chequeId}')"><span class="ico">${icon('wallet', { size: 18 })}</span>Bankaya Yatır / Kasada Tut / Başka Yere Ver</button>
    </div>
  `;
  openSheet(html);
}

// -------- "Bir Müşteriye Ver" — light, no ledger effect, just a custody note.
// `movementId` (optional): editing the LAST movement in place instead of
// appending a new one.
export async function openChequeGiveToClientForm(chequeId, movementId) {
  const [cheque, clients] = await Promise.all([repo.getCheque(chequeId), repo.getClients()]);
  const editing = movementId ? (cheque.movements || []).find((m) => m.id === movementId) : null;
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${editing ? 'Hareketi Düzenle' : 'Müşteriye Ver'}</h2>
    <div class="field">
      <label>Hangi Müşteri *</label>
      <input id="fChequeClientName" list="chequeClientList" placeholder="Listeden seç veya yeni bir isim yaz" value="${editing ? escapeHtml(editing.toClientName || '') : ''}">
      ${datalist('chequeClientList', clients.map((c) => c.name))}
    </div>
    <div class="field"><label>Tarih *</label><input id="fChequeClientDate" type="date" value="${editing ? editing.date : todayISO()}"></div>
    <button class="btn primary" onclick="H.guard(this, () => H.saveChequeGiveToClient('${chequeId}'${movementId ? `,'${movementId}'` : ''}))">Kaydet</button>
  `;
  openSheet(html);
}

export async function saveChequeGiveToClient(chequeId, movementId) {
  const name = document.getElementById('fChequeClientName').value.trim();
  const date = document.getElementById('fChequeClientDate').value;
  if (!name) { toast('Müşteri adını seç veya yaz', 'error'); return; }
  if (!date) { toast('Tarih zorunlu', 'error'); return; }
  const movement = { toType: 'client', toClientName: name, date };
  if (movementId) {
    await repo.updateLastChequeMovement(chequeId, movement);
  } else {
    await repo.appendChequeMovement(chequeId, movement);
  }
  toast('Çek güncellendi', 'success');
  closeSheet();
  refresh();
}

// -------- "Bankaya Yatır / Kasada Tut / Başka Yere Ver" — light, free text.
export async function openChequeMarkOtherForm(chequeId, movementId) {
  const cheque = await repo.getCheque(chequeId);
  const editing = movementId ? (cheque.movements || []).find((m) => m.id === movementId) : null;
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${editing ? 'Hareketi Düzenle' : 'Çek Nereye Gitti?'}</h2>
    <div class="field">
      <label>Nereye / Kime *</label>
      <input id="fChequeOtherText" placeholder="Örn: Banka, Kasa, ya da bir isim" value="${editing ? escapeHtml(editing.toText || '') : ''}">
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" class="btn small outline" onclick="document.getElementById('fChequeOtherText').value='Banka'">Banka</button>
        <button type="button" class="btn small outline" onclick="document.getElementById('fChequeOtherText').value='Kasa'">Kasa</button>
      </div>
    </div>
    <div class="field"><label>Tarih *</label><input id="fChequeOtherDate" type="date" value="${editing ? editing.date : todayISO()}"></div>
    <button class="btn primary" onclick="H.guard(this, () => H.saveChequeMarkOther('${chequeId}'${movementId ? `,'${movementId}'` : ''}))">Kaydet</button>
  `;
  openSheet(html);
}

export async function saveChequeMarkOther(chequeId, movementId) {
  const text = document.getElementById('fChequeOtherText').value.trim();
  const date = document.getElementById('fChequeOtherDate').value;
  if (!text) { toast('Nereye/kime verdiğini yaz', 'error'); return; }
  if (!date) { toast('Tarih zorunlu', 'error'); return; }
  const movement = { toType: 'other', toText: text, date };
  if (movementId) {
    await repo.updateLastChequeMovement(chequeId, movement);
  } else {
    await repo.appendChequeMovement(chequeId, movement);
  }
  toast('Çek güncellendi', 'success');
  closeSheet();
  refresh();
}

// Undo (delete) ONLY the most recent movement — the cheque falls back to
// whatever/whoever held it before that. Older history is never touched.
export async function undoLastChequeMovement(chequeId) {
  const cheque = await repo.getCheque(chequeId);
  if (!cheque || !cheque.movements || !cheque.movements.length) return;
  const last = cheque.movements[cheque.movements.length - 1];
  const label = calc.chequeMovementLabel(last);
  const msg = last.toType === 'vendor'
    ? `En son "${label}" hareketini geri almak istiyor musun? Bağlı ödeme kaydı da silinecek.`
    : `En son "${label}" hareketini geri almak istiyor musun?`;
  if (!(await confirmDialog(msg))) return;
  if (last.toType === 'vendor' && last.paymentId) {
    await repo.deletePayment(last.paymentId);
  }
  await repo.removeLastChequeMovement(chequeId);
  toast('Hareket geri alındı', 'success');
  refresh();
}

// "Düzenle" on the last movement — routes to whichever form matches its
// type, pre-filled, so correcting it doesn't mean deleting and starting over.
export async function editLastChequeMovement(chequeId) {
  const cheque = await repo.getCheque(chequeId);
  if (!cheque || !cheque.movements || !cheque.movements.length) return;
  const last = cheque.movements[cheque.movements.length - 1];
  if (last.toType === 'vendor') {
    if (last.paymentId) openPaymentForm({ paymentId: last.paymentId });
    else toast('Bu hareketin bağlı ödeme kaydı bulunamadı', 'error');
  } else if (last.toType === 'client') {
    openChequeGiveToClientForm(chequeId, last.id);
  } else {
    openChequeMarkOtherForm(chequeId, last.id);
  }
}

export async function deleteChequeRecord(chequeId) {
  const cheque = await repo.getCheque(chequeId);
  const col = cheque ? await repo.getCollectionByChequeId(chequeId) : null;
  const movements = cheque ? (cheque.movements || []) : [];
  const vendorMoves = movements.filter((m) => m.toType === 'vendor' && m.paymentId);
  let msg = 'Bu çeki silmek istiyor musun?';
  if (movements.length) msg = `Bu çeğin ${movements.length} hareketlik bir geçmişi var — silersen tüm geçmişi ve bağlı ${vendorMoves.length > 0 ? 'ödeme kayıtları' : 'kayıtları'} da silinecek. ` + msg;
  if (col) msg += ' Bu çeki oluşturan tahsilat kaydı da silinecek.';
  if (!(await confirmDialog(msg))) return;
  for (const m of vendorMoves) {
    await repo.deletePayment(m.paymentId);
  }
  if (col) await repo.deleteCollection(col.id);
  await repo.deleteCheque(chequeId);
  toast('Çek silindi', 'success');
  navigate('/finance/cheques');
}

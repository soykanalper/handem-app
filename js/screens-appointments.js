// ---------------------------------------------------------------------------
// screens-appointments.js — Randevu / Toplantı Ajandası (§ajanda). Basit,
// hızlı kayıt: kişi/kurum, konu, tarih+saat, katılımcılar, not, sonradan
// eklenebilen sonuç notu. Ana Sayfa'daki hesap ikonunun yanındaki yeni
// takvim ikonundan açılır. Geçmiş Kampanyalar ile birebir aynı mantık:
// tarihi geçen randevular hiçbir zaman kaybolmaz, ayrı bir "Geçmiş" sayfada
// (en son olan üstte) geriye dönük gezilebilir; ana liste bugünden itibaren
// geleceğe dönük olanları gösterir. Düzenleme her zaman ayrı bir kalem
// düğmesinden açılır — yanlışlıkla dokunup silme riski olmasın diye (§kunye
// dersi, aynı ihtiyat burada da uygulandı).
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import { formatDate, escapeHtml, jsAttr, todayISO, toast } from './util.js';
import { setTopbar, setContent, setActiveNav, setFabVisible, setFabAction, navigate, openSheet, closeSheet, confirmDialog, noteFieldHtml, refresh } from './ui.js';
import { avatarHtml, emptyState, appointmentRowHtml } from './components.js';
import { icon } from './icons.js';

// ============================================================================
// ANA LİSTE — bugün ve sonrası, tarihe göre artan sırada (en yakın üstte).
// ============================================================================
export async function renderAppointments() {
  setActiveNav('home');
  setFabVisible(true);
  setFabAction(() => window.H.openAppointmentForm());
  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/')">${icon('chevronLeft')}</button>
      <div><h1>Randevu Ajandası</h1></div>
    </div>
    <div class="right">
      <button class="icon-btn add" onclick="H.openAppointmentForm()">${icon('plus')}</button>
    </div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const all = await repo.getAllAppointments();
  const today = todayISO();
  const upcoming = all
    .filter((a) => (a.date || '') >= today)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));

  let html = `<div class="section-title">Yaklaşan Randevular<span class="link" onclick="H.goto('/randevu/gecmis')">${icon('archive', { size: 12, className: 'icon-inline' })} Geçmiş</span></div>`;
  if (upcoming.length === 0) {
    html += emptyState(icon('calendar', { size: 32 }), 'Yaklaşan randevu yok', 'Sağ üstteki + ile yeni bir randevu/toplantı ekle.');
  } else {
    html += upcoming.map((a) => appointmentRowHtml(a, {
      onClick: (aa) => `H.goto('/randevu/${aa.id}')`,
      onDelete: (aa) => `H.deleteAppointmentUI('${aa.id}')`
    })).join('');
  }

  setContent(html);
}

// ============================================================================
// GEÇMİŞ RANDEVULAR — Geçmiş Kampanyalar ile aynı desen: tarihi geçmiş
// randevular hiç kaybolmaz, en son olan üstte.
// ============================================================================
export async function renderPastAppointments() {
  setActiveNav('home');
  setFabVisible(false);
  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/randevu')">${icon('chevronLeft')}</button>
      <div><h1>Geçmiş Randevular</h1><div class="sub">Tarihi geçmiş randevular · en son olan üstte</div></div>
    </div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const all = await repo.getAllAppointments();
  const today = todayISO();
  const past = all
    .filter((a) => (a.date || '') < today)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || ''));

  let html = '';
  if (past.length === 0) {
    html += emptyState(icon('archive', { size: 32 }), 'Geçmiş randevu yok', 'Tarihi geçen bir randevu olunca burada görünecek.');
  } else {
    html += past.map((a) => appointmentRowHtml(a, {
      onClick: (aa) => `H.goto('/randevu/${aa.id}')`,
      onDelete: (aa) => `H.deleteAppointmentUI('${aa.id}')`
    })).join('');
  }

  setContent(html);
}

// ============================================================================
// RANDEVU DETAYI — tüm alanlar + Sonuç Notu, düzenleme kalemi + silme.
// ============================================================================
export async function renderAppointmentDetail({ appointmentId }) {
  setActiveNav('home');
  setFabVisible(false);
  const a = await repo.getAppointment(appointmentId);
  if (!a) { navigate('/randevu'); return; }

  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/randevu')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(a.subject || a.person || 'Randevu')}</h1></div>
    </div>
    <div class="right">
      <button class="icon-btn" onclick="H.openAppointmentForm('${a.id}')">${icon('pencil', { size: 16 })}</button>
    </div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  let html = `<div class="detail-card">`;
  html += `<div class="detail-row"><span class="k">Tarih</span><span class="v">${formatDate(a.date)}${a.time ? ' · ' + escapeHtml(a.time) : ''}</span></div>`;
  if (a.person) html += `<div class="detail-row"><span class="k">Kişi / Kurum</span><span class="v">${escapeHtml(a.person)}</span></div>`;
  if (a.subject) html += `<div class="detail-row"><span class="k">Konu</span><span class="v">${escapeHtml(a.subject)}</span></div>`;
  if (a.participants) html += `<div class="detail-row stacked"><span class="k">Katılımcılar</span><span class="v" style="white-space:pre-wrap;">${escapeHtml(a.participants)}</span></div>`;
  if (a.note) html += `<div class="detail-row stacked"><span class="k">Not</span><span class="v" style="white-space:pre-wrap;">${escapeHtml(a.note)}</span></div>`;
  if (a.resultNote) html += `<div class="detail-row stacked"><span class="k">Sonuç Notu</span><span class="v" style="white-space:pre-wrap;">${escapeHtml(a.resultNote)}</span></div>`;
  html += `</div>`;

  html += `<button class="btn small outline" onclick="H.openAppointmentForm('${a.id}')">${icon('pencil', { size: 15 })} Düzenle</button>`;
  html += `<button class="btn danger" onclick="H.deleteAppointmentUI('${a.id}')">Randevuyu Sil</button>`;

  setContent(html);
}

// ============================================================================
// EKLE / DÜZENLE formu
// ============================================================================
export async function openAppointmentForm(appointmentId) {
  const existing = appointmentId ? await repo.getAppointment(appointmentId) : null;

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${existing ? 'Randevuyu Düzenle' : 'Yeni Randevu / Toplantı'}</h2>
    <div class="field"><label>Kişi / Kurum</label><input id="fApPerson" value="${existing && existing.person ? escapeHtml(existing.person) : ''}" placeholder="Örn: Ahmet Bey / Acme A.Ş."></div>
    <div class="field"><label>Toplantı Konusu</label><input id="fApSubject" value="${existing && existing.subject ? escapeHtml(existing.subject) : ''}" placeholder="Örn: Yıllık anlaşma görüşmesi"></div>
    <div class="row2">
      <div class="field"><label>Tarih *</label><input id="fApDate" type="date" value="${existing && existing.date ? existing.date : todayISO()}"></div>
      <div class="field"><label>Saat</label><input id="fApTime" type="time" value="${existing && existing.time ? existing.time : ''}"></div>
    </div>
    <div class="field"><label>Katılımcılar</label><input id="fApParticipants" value="${existing && existing.participants ? escapeHtml(existing.participants) : ''}" placeholder="Virgülle ayırarak yaz"></div>
    <div class="field">${noteFieldHtml('fApNote', existing && existing.note ? existing.note : '', 'Toplantı Notu')}</div>
    <div class="field" style="margin-top:8px;">${noteFieldHtml('fApResult', existing && existing.resultNote ? existing.resultNote : '', 'Sonuç Notu')}</div>
    <button class="btn primary" onclick="H.guard(this, () => H.saveAppointment('${existing ? existing.id : ''}'))">Kaydet</button>
  `;
  openSheet(html);
}

export async function saveAppointment(appointmentId) {
  const person = document.getElementById('fApPerson').value.trim();
  const subject = document.getElementById('fApSubject').value.trim();
  const date = document.getElementById('fApDate').value;
  const time = document.getElementById('fApTime').value || '';
  const participants = document.getElementById('fApParticipants').value.trim();
  const note = document.getElementById('fApNote').value.trim();
  const resultNote = document.getElementById('fApResult').value.trim();

  if (!date) { toast('Tarih zorunlu', 'error'); return; }
  if (!person && !subject) { toast('Kişi/Kurum ya da Toplantı Konusu en az biri girilmeli', 'error'); return; }

  const data = { person, subject, date, time, participants, note, resultNote };
  try {
    if (appointmentId) {
      await repo.updateAppointment(appointmentId, data);
      toast('Randevu güncellendi', 'success');
    } else {
      await repo.createAppointment(data);
      toast('Randevu eklendi', 'success');
    }
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteAppointmentUI(appointmentId) {
  if (!(await confirmDialog('Bu randevuyu silmek istiyor musun?'))) return;
  await repo.deleteAppointment(appointmentId);
  toast('Randevu silindi', 'success');
  navigate('/randevu');
}

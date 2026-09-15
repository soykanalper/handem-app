// ---------------------------------------------------------------------------
// reminders.js — "Takip" (tracking) reminders shown from the Ana Sayfa bell
// icon: upcoming cheque due dates and upcoming campaign end dates, merged
// into one dismissible list. Ristorno reminders are deliberately NOT
// included yet — the data model has no dated field for a ristorno payment
// (it's just a percentage on the mecra record), so there is nothing to
// count down to; that can be added later once that field exists.
//
// Dismiss state lives only in the local `meta` key/value store (see
// db.js / db-router.js — getMeta/setMeta are explicitly per-device, never
// synced), same as every other piece of local-only UI state in this app.
// Dismissing a reminder is keyed to that record's CURRENT date, so if the
// cheque's vade or the campaign's bitiş tarihi is later changed, it's
// treated as a new reminder and reappears — dismissing only silences the
// specific date you already knew about.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import { getMeta, setMeta } from './db.js';
import { todayISO } from './util.js';
import { CHEQUE_MANUAL_STATUSES } from './calc.js';
import { getAllClientsAggregate } from './aggregate.js';

export const LEAD_DAYS = 7;
// §ajanda-takip: randevular çek/kampanya gibi 7 gün önceden değil, kullanıcının
// istediği gibi sadece 1 gün önceden Takip'te görünsün.
export const APPOINTMENT_LEAD_DAYS = 1;
const DISMISS_KEY = 'remind-dismissed';

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function getDismissedKeys() {
  const arr = await getMeta(DISMISS_KEY, []);
  return new Set(Array.isArray(arr) ? arr : []);
}

// Pure reshape — no fetching — so callers that already have `clients` (Ana
// Sayfa already fetches it via getBusinessOverview()) don't pay for a second
// fetch just to show the bell badge count.
export function buildReminders(cheques, clients, appointments = [], today = todayISO()) {
  const horizon = addDays(today, LEAD_DAYS);
  const apptHorizon = addDays(today, APPOINTMENT_LEAD_DAYS);
  const rows = [];

  cheques.forEach((c) => {
    if (!c.dueDate || c.deleted) return;
    if (CHEQUE_MANUAL_STATUSES.includes(c.status)) return;
    if (c.dueDate > horizon) return; // henüz uyarı penceresine girmedi
    const overdue = c.dueDate < today;
    rows.push({
      dismissKey: `cheque:${c.id}:${c.dueDate}`,
      type: 'cheque',
      title: c.counterpartyName || '(İsimsiz)',
      subtitle: (c.direction === 'received' ? 'Alınacak Çek' : 'Verilecek Çek') + (c.campaignName ? ' · ' + c.campaignName : ''),
      amount: c.amount,
      date: c.dueDate,
      overdue,
      link: `/finance/cheques/${c.id}`
    });
  });

  clients.forEach(({ client, campaigns }) => {
    campaigns.forEach(({ campaign }) => {
      if (!campaign || !campaign.endDate || campaign.deleted) return;
      if (campaign.endDate < today || campaign.endDate > horizon) return;
      rows.push({
        dismissKey: `campaign:${campaign.id}:${campaign.endDate}`,
        type: 'campaign',
        title: campaign.name || campaign.productName || 'Kampanya',
        subtitle: `${client.name} · Kampanya bitiyor`,
        amount: null,
        date: campaign.endDate,
        overdue: false,
        link: `/campaigns/${campaign.id}`
      });
    });
  });

  // §ajanda-takip: randevular sadece 1 gün öncesinden itibaren (bugün dahil)
  // Takip'te görünür — tarihi geçmiş randevu burada tekrar görünmesin.
  appointments.forEach((a) => {
    if (!a.date || a.deleted) return;
    if (a.date < today || a.date > apptHorizon) return;
    rows.push({
      dismissKey: `appointment:${a.id}:${a.date}`,
      type: 'appointment',
      title: a.subject || a.person || 'Randevu',
      subtitle: (a.person && a.subject ? a.person + ' · ' : '') + 'Randevu' + (a.time ? ' · ' + a.time : ''),
      amount: null,
      date: a.date,
      overdue: false,
      link: `/randevu/${a.id}`
    });
  });

  // En yakın tarih en üstte — vadesi geçmiş/bugün olanlar doğal olarak başa gelir.
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

// Self-fetching convenience for the Takip page (does its own cheques +
// clients + randevu fetch, then filters out anything already dismissed).
export async function getReminders() {
  const today = todayISO();
  const [cheques, clients, appts] = await Promise.all([repo.getAllCheques(), getAllClientsAggregate(), repo.getAllAppointments()]);
  const all = buildReminders(cheques, clients, appts, today);
  const dismissed = await getDismissedKeys();
  return all.filter((r) => !dismissed.has(r.dismissKey));
}

export async function dismissReminder(dismissKey) {
  const set = await getDismissedKeys();
  set.add(dismissKey);
  await setMeta(DISMISS_KEY, [...set]);
}

export async function dismissAllReminders(dismissKeys) {
  const set = await getDismissedKeys();
  dismissKeys.forEach((k) => set.add(k));
  await setMeta(DISMISS_KEY, [...set]);
}

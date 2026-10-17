import { getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'
import { LEDGER_TYPES } from '../config/ledger'
import { readSettings, readIssued, planLatestChange, applyLatestChange, writePointsEntry, numbersText } from './invoiceChain'
import { writeCash } from './cashService'
import { RATE_SCALE } from '../utils/money'
import { millis } from '../utils/date'

/**
 * Kartela e klientit.
 *
 * Gjendja = Σ shuma e lëvizjeve (për monedhë). Shuma ruhet me shenjë:
 * pozitive rrit borxhin (DETYRIM), negative e ul (deri në TEPRICË).
 * Gjendja e ruajtur te klienti përditësohet në të njëjtin transaction me
 * lëvizjen; firestore.rules e verifikojnë që ndryshimi = shuma e lëvizjes.
 */

/** Të gjitha lëvizjet e një klienti, të renditura kronologjikisht. */
export function watchClientLedger(clientId, onData, onError) {
  return onSnapshot(
    query(companyCol('ledger'), where('clientId', '==', clientId)),
    (snap) => onData(sortLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    onError,
  )
}

/**
 * Σ shuma e lëvizjeve të kartelës me datë ≥ `from`, për klient dhe monedhë:
 * { clientId: { MONEDHA: shuma } }. Gjendja para `from` = gjendja aktuale − kjo shumë.
 */
export async function ledgerSince(from) {
  const snap = await getDocs(query(companyCol('ledger'), where('data', '>=', from)))
  const out = {}
  for (const d of snap.docs) {
    const { clientId, monedha, shuma } = d.data()
    const c = (out[clientId] ??= {})
    c[monedha] = (c[monedha] ?? 0) + (shuma ?? 0)
  }
  return out
}

export function sortLedger(entries) {
  return [...entries].sort(
    (a, b) => millis(a.data) - millis(b.data) || millis(a.krijuar) - millis(b.krijuar),
  )
}

/** Shton gjendjen progresive (`gjendjaPas`) për çdo lëvizje, veçmas për monedhë. */
export function withRunningBalance(entries) {
  const run = {}
  return sortLedger(entries).map((e) => {
    run[e.monedha] = (run[e.monedha] ?? 0) + e.shuma
    return { ...e, gjendjaPas: run[e.monedha] }
  })
}

/** Ekstrakt llogarie për një periudhë dhe monedhë. */
export function buildStatement(entries, monedha, from, to) {
  const list = sortLedger(entries.filter((e) => e.monedha === monedha))
  let hapese = 0
  let run = 0
  const rows = []
  for (const e of list) {
    const t = millis(e.data)
    if (from && t < from.getTime()) {
      hapese += e.shuma
      run = hapese
      continue
    }
    if (to && t > to.getTime()) break
    run += e.shuma
    rows.push({ ...e, gjendjaPas: run })
  }
  const debi = rows.filter((r) => r.shuma > 0).reduce((s, r) => s + r.shuma, 0)
  const kredi = rows.filter((r) => r.shuma < 0).reduce((s, r) => s - r.shuma, 0)
  return { hapese, rows, debi, kredi, mbyllese: hapese + debi - kredi }
}

export function rateFor(monedha, settings) {
  return monedha === 'LEK' ? RATE_SCALE : settings.monedhat[monedha]
}

/**
 * Të dhënat e një lëvizjeje kartele (përdoret edhe nga lëshimi / anulimi i faturës).
 * `shuma` është me shenjë.
 */
export function ledgerEntryData({ clientId, tipi, monedha, kursi, shuma, data, para, shenim = '', arsye = '', metoda = null, faturaId = null }, actorName) {
  return {
    clientId,
    tipi,
    monedha,
    kursi,
    shuma,
    data,
    shenim: shenim.trim(),
    arsye: arsye.trim(),
    metoda: tipi === 'pagese' ? metoda : null,
    faturaId,
    gjendjaPara: para,
    gjendjaPas: para + shuma,
    uid: auth.currentUser.uid,
    emri: actorName ?? '',
    krijuar: serverTimestamp(),
  }
}

/**
 * Shton një lëvizje në kartelë (pa faturë të re). Lëvizja ndikon te fatura më e
 * fundit e klientit në atë monedhë (ajo që mban borxhin): i ndryshon `mbetur`
 * dhe statusin; nëse borxhi shlyhet, faturat "Pasuar" kalojnë në "E paguar"
 * dhe klienti merr pikët.
 * @param shuma  për llojet me shenjë fikse: shuma pozitive (shenja vendoset nga lloji);
 *               për rregullim / gjendje fillestare: shuma me shenjë.
 */
export async function addLedgerEntry({ clientId, tipi, monedha, shuma, data, shenim = '', arsye = '', metoda = null, kursi }, actorName) {
  const type = LEDGER_TYPES[tipi]
  if (!type || tipi === 'fature' || tipi === 'anulim') throw new Error('Lloj lëvizjeje i panjohur.')
  if (!Number.isInteger(shuma) || shuma === 0) throw new Error('Shuma duhet të jetë e ndryshme nga zero.')
  if (type.sign !== 0 && shuma < 0) throw new Error('Shuma duhet të jetë pozitive.')
  if ((tipi === 'rregullim' || tipi === 'kthim' || tipi === 'zbritje' || tipi === 'poste') && !(arsye || shenim).trim()) {
    throw new Error('Shkruani arsyen / shënimin.')
  }
  const signed = type.sign === 0 ? shuma : type.sign * shuma

  const clientRef = companyDoc('clients', clientId)
  const entryRef = newDocRef('ledger')

  await runTransaction(db, async (tx) => {
    // --- leximet ---
    const snap = await tx.get(clientRef)
    if (!snap.exists()) throw new Error('Klienti nuk ekziston.')
    const client = snap.data()
    const gjendje = client.gjendje ?? {}
    const fillestare = client.fillestare ?? {}
    if (tipi === 'gjendje_fillestare' && fillestare[monedha]) {
      throw new Error(`Gjendja fillestare në ${monedha} është vendosur tashmë. Përdorni "Rregullim gjendjeje".`)
    }
    const settings = await readSettings(tx)
    const latest = await readIssued(tx, client.faturaFundit?.[monedha])
    const plan = await planLatestChange(tx, latest, signed)

    // --- shkrimet ---
    const para = gjendje[monedha] ?? 0
    const pas = para + signed
    tx.set(entryRef, ledgerEntryData({ clientId, tipi, monedha, kursi, shuma: signed, data, para, shenim, arsye, metoda, faturaId: latest?.id ?? null }, actorName))
    // Pagesa e klientit hyn në arkë / bankë
    if (tipi === 'pagese') {
      writeCash(tx, { llogaria: metoda ?? 'arke', monedha, kursi, shuma: -signed, tipi: 'arketim', data, shenim: `${client.emri}${shenim.trim() ? ` – ${shenim.trim()}` : ''}`, clientId, ledgerId: entryRef.id }, actorName)
    }

    const pts = applyLatestChange(tx, plan, client, settings)
    const pointsPatch = writePointsEntry(
      tx,
      { clientId, client, pike: pts.total, tipi: 'fituar', arsye: `Fatura të paguara: ${numbersText(pts.paid.filter((i) => pts.per[i.id]))}`, invoiceIds: Object.keys(pts.per) },
      actorName,
    )

    const update = { [`gjendje.${monedha}`]: pas, lastLedgerIds: [entryRef.id], ...pointsPatch }
    if (tipi === 'gjendje_fillestare') update[`fillestare.${monedha}`] = true
    tx.update(clientRef, update)
    addAudit(tx, {
      action: `kartela_${tipi}`,
      entity: 'ledger',
      entityId: entryRef.id,
      details: {
        clientId,
        kodi: client.kodi,
        monedha,
        shuma: signed,
        gjendjaPara: para,
        gjendjaPas: pas,
        arsye: arsye.trim(),
        shenim: shenim.trim(),
        ...(plan ? { fatura: latest.data.numri, statusiFatures: plan.statusi } : {}),
      },
      actorName,
    })
  })
  return entryRef.id
}

/** Rregullim manual: vendos gjendjen në vlerën e re dhe ruan diferencën si lëvizje. */
export async function adjustBalanceTo({ clientId, monedha, gjendjaAktuale, gjendjaRe, data, arsye, kursi }, actorName) {
  const diff = gjendjaRe - gjendjaAktuale
  if (diff === 0) throw new Error('Gjendja e re është e njëjtë me atë aktuale.')
  return addLedgerEntry({ clientId, tipi: 'rregullim', monedha, shuma: diff, data, arsye, kursi }, actorName)
}

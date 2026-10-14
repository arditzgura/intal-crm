import {
  getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  startAfter, where, writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'
import { ledgerEntryData } from './ledgerService'
import { formatDocNumber } from './settingsService'
import { aggregateByItem, writeMovement } from './stockService'
import {
  ISSUED, invoiceRef, readSettings, readIssued, readPasuarChain, awardPoints,
  writePointsEntry, numbersText, planLatestChange, applyLatestChange,
} from './invoiceChain'
import { millis } from '../utils/date'

/**
 * Faturat.
 *
 * Draft → Lëshim bëhet në NJË transaction:
 *   numri (counters/invoices + invoiceNumbers/{numri} unik) · kartela (faturë,
 *   pagesë, rregullim) · zinxhiri (e mëparshmja → Pasuar / E paguar) · pikët ·
 *   rreshtat (invoiceLines) · lëvizjet e stokut (dalje) + stock/{itemId} · auditLog.
 * Fatura e lëshuar nuk ndryshohet; korrigjimi bëhet me anulim.
 */

const counterRef = () => companyDoc('counters', 'invoices')
const numberRef = (n) => companyDoc('invoiceNumbers', String(n))
export const lineId = (invoiceId, i) => `${invoiceId}_${i}`

function klientSnapshot(id, c) {
  return {
    id,
    kodi: c.kodi ?? '',
    emri: c.emri ?? '',
    qyteti: c.qyteti ?? '',
    adresa: c.adresa ?? '',
    telefoni: c.telefoni ?? '',
    nipt: c.nipt ?? '',
    rastesor: !!c.rastesor,
  }
}

function cleanLines(rreshtat) {
  const lines = rreshtat
    .filter((r) => r.itemId)
    .map((r) => {
      const sasia = Math.trunc(Number(r.sasia))
      const cmimi = Math.trunc(Number(r.cmimi))
      if (!Number.isInteger(sasia) || sasia <= 0) throw new Error(`Sasia e "${r.emri}" nuk është e vlefshme.`)
      if (!Number.isInteger(cmimi) || cmimi < 0) throw new Error(`Çmimi i "${r.emri}" nuk është i vlefshëm.`)
      return {
        itemId: r.itemId,
        kodi: r.kodi ?? '',
        emri: r.emri ?? '',
        njesia: r.njesia ?? '',
        sasia,
        cmimi,
        cmimiOrigjinal: r.cmimiOrigjinal != null && r.cmimiOrigjinal !== cmimi ? r.cmimiOrigjinal : null,
        totali: sasia * cmimi,
      }
    })
  return lines
}

const sumLines = (lines) => lines.reduce((s, l) => s + l.totali, 0)

// ---------- Drafte ----------

export async function saveDraft(draftId, data, actorName) {
  const ref = draftId ? companyDoc('invoices', draftId) : newDocRef('invoices')
  const rreshtat = cleanLines(data.rreshtat ?? [])
  const batch = writeBatch(db)
  const doc = {
    statusi: 'draft',
    numri: null,
    clientId: data.clientId ?? null,
    klient: data.client ? klientSnapshot(data.clientId, data.client) : null,
    monedha: data.monedha,
    kursi: data.kursi,
    data: data.data,
    rreshtat,
    totali: sumLines(rreshtat),
    paguar: data.paguar ?? 0,
    metodaPagese: data.metodaPagese ?? 'arke',
    shenime: (data.shenime ?? '').trim(),
    ndryshuar: serverTimestamp(),
  }
  if (draftId) batch.update(ref, doc)
  else batch.set(ref, { ...doc, krijuar: serverTimestamp(), krijuarNga: { uid: auth.currentUser.uid, emri: actorName ?? '' } })
  addAudit(batch, { action: draftId ? 'ndryshim_drafti' : 'krijim_drafti', entity: 'invoices', entityId: ref.id, details: { klienti: doc.klient?.emri ?? '', totali: doc.totali }, actorName })
  await batch.commit()
  return ref.id
}

export async function deleteDraft(draftId, actorName) {
  const batch = writeBatch(db)
  batch.delete(companyDoc('invoices', draftId))
  addAudit(batch, { action: 'fshirje_drafti', entity: 'invoices', entityId: draftId, actorName })
  await batch.commit()
}

// ---------- Lëshimi ----------

/**
 * @param data { clientId, monedha, kursi, data (Timestamp), rreshtat, shenime,
 *               paguar, metodaPagese, gjendjaParaManual (int|null), arsyeRregullimi }
 */
export async function issueInvoice(draftId, data, actorName) {
  const rreshtat = cleanLines(data.rreshtat)
  if (!rreshtat.length) throw new Error('Fatura nuk ka asnjë artikull.')
  if (!data.clientId) throw new Error('Zgjidhni klientin.')
  const paguar = Math.trunc(Number(data.paguar) || 0)
  if (paguar < 0) throw new Error('Shuma e paguar nuk mund të jetë negative.')
  const totali = sumLines(rreshtat)
  const { monedha, kursi } = data
  const ref = draftId ? companyDoc('invoices', draftId) : newDocRef('invoices')
  const clientRef = companyDoc('clients', data.clientId)
  const uid = auth.currentUser.uid

  return runTransaction(db, async (tx) => {
    // ---------- leximet ----------
    let draft = null
    if (draftId) {
      const d = await tx.get(ref)
      if (!d.exists() || d.data().statusi !== 'draft') throw new Error('Drafti nuk ekziston më ose është lëshuar tashmë.')
      draft = d.data()
    }
    const counter = await tx.get(counterRef())
    let n = counter.exists() ? counter.data().next : 1
    // Numri është unik pa përjashtim: kapërce çdo numër të zënë.
    for (let i = 0; i < 100; i++) {
      if (!(await tx.get(numberRef(n))).exists()) break
      n++
    }
    const cSnap = await tx.get(clientRef)
    if (!cSnap.exists()) throw new Error('Klienti nuk ekziston.')
    const client = cSnap.data()
    const settings = await readSettings(tx)
    const prev = await readIssued(tx, client.faturaFundit?.[monedha])

    const G = client.gjendje?.[monedha] ?? 0
    const manual = data.gjendjaParaManual
    const diff = manual != null && manual !== G ? manual - G : 0
    if (diff && !data.arsyeRregullimi?.trim()) throw new Error('Shkruani arsyen e ndryshimit të gjendjes së mëparshme.')
    const gjendjaPara = G + diff
    const gjendjaRe = gjendjaPara + totali - paguar
    const statusi = gjendjaRe <= 0 ? 'e_paguar' : 'pa_paguar'

    // Zinxhiri: nëse kjo faturë lind e paguar, shlyhen edhe "pasuar"-at para saj.
    let chain = []
    if (prev && statusi === 'e_paguar' && prev.data.statusi === 'pa_paguar') {
      chain = [prev, ...(await readPasuarChain(tx, prev.data))]
    }

    // ---------- shkrimet ----------
    const numriTekst = formatDocNumber(settings.numerimi.invoices, n)
    const self = { id: ref.id, data: { totali, kursi, piketDhene: 0, numri: n, numriTekst } }
    const pts = awardPoints(statusi === 'e_paguar' ? [self, ...chain] : [], client, settings)

    tx.set(numberRef(n), { invoiceId: ref.id, krijuar: serverTimestamp() })
    tx.set(counterRef(), { next: n + 1 }, { merge: true })

    const invoice = {
      numri: n,
      numriTekst,
      numriVjeter: null,
      statusi,
      clientId: data.clientId,
      klient: klientSnapshot(data.clientId, client),
      monedha,
      kursi,
      data: data.data,
      rreshtat,
      nentotali: totali,
      totali,
      gjendjaParaLlogaritur: G,
      gjendjaPara,
      rregullim: diff ? { shuma: diff, arsye: data.arsyeRregullimi.trim() } : null,
      paguar,
      metodaPagese: paguar > 0 ? data.metodaPagese : null,
      gjendjaRe,
      mbetur: gjendjaRe,
      faturaPara: prev?.id ?? null,
      faturaPas: null,
      piketDhene: pts.per[ref.id] ?? 0,
      shenime: (data.shenime ?? '').trim(),
      krijuar: draft?.krijuar ?? serverTimestamp(),
      krijuarNga: draft?.krijuarNga ?? { uid, emri: actorName ?? '' },
      leshuar: serverTimestamp(),
      leshuarNga: { uid, emri: actorName ?? '' },
      anuluar: null,
    }
    tx.set(ref, invoice)

    // Rreshtat për statistikat dhe lëvizjet e stokut
    rreshtat.forEach((l, i) => {
      tx.set(companyDoc('invoiceLines', lineId(ref.id, i)), {
        invoiceId: ref.id,
        numri: n,
        data: data.data,
        clientId: data.clientId,
        itemId: l.itemId,
        sasia: l.sasia,
        cmimi: l.cmimi,
        totali: l.totali,
        monedha,
        kursi,
        anuluar: false,
      })
    })
    // Stoku: një lëvizje "dalje" për çdo artikull
    for (const m of aggregateByItem(rreshtat)) {
      writeMovement(tx, { itemId: m.itemId, sasia: -m.sasia, tipi: 'dalje', dokument: 'fature', invoiceId: ref.id, numri: n, data: data.data }, actorName)
    }

    // Kartela: [rregullim] + faturë + [pagesë]
    const ledgerIds = []
    let bal = G
    const addLedger = (fields) => {
      const lref = newDocRef('ledger')
      tx.set(lref, ledgerEntryData({ clientId: data.clientId, monedha, kursi, data: data.data, para: bal, faturaId: ref.id, ...fields }, actorName))
      bal += fields.shuma
      ledgerIds.push(lref.id)
    }
    if (diff) addLedger({ tipi: 'rregullim', shuma: diff, arsye: data.arsyeRregullimi, shenim: `Ndryshim i gjendjes së mëparshme te fatura #${numriTekst}` })
    addLedger({ tipi: 'fature', shuma: totali, shenim: `Fatura #${numriTekst}` })
    if (paguar > 0) addLedger({ tipi: 'pagese', shuma: -paguar, metoda: data.metodaPagese, shenim: `Paguar te fatura #${numriTekst}` })

    // Fatura e mëparshme
    if (prev) {
      if (statusi === 'e_paguar' && chain.length) {
        for (const c of chain) {
          tx.update(c.ref, { statusi: 'e_paguar', ...(c.id === prev.id ? { faturaPas: ref.id } : {}), ...(pts.per[c.id] ? { piketDhene: pts.per[c.id] } : {}) })
        }
      } else {
        tx.update(prev.ref, { faturaPas: ref.id, ...(prev.data.statusi === 'pa_paguar' ? { statusi: 'pasuar' } : {}) })
      }
    }

    const pointsPatch = writePointsEntry(
      tx,
      {
        clientId: data.clientId,
        client,
        pike: pts.total,
        tipi: 'fituar',
        arsye: `Fatura të paguara: ${numbersText([self, ...chain].filter((i) => pts.per[i.id]))}`,
        invoiceIds: Object.keys(pts.per),
      },
      actorName,
    )

    tx.update(clientRef, {
      [`gjendje.${monedha}`]: gjendjaRe,
      [`faturaFundit.${monedha}`]: ref.id,
      lastLedgerIds: ledgerIds,
      ...pointsPatch,
    })

    addAudit(tx, {
      action: 'leshim_fature',
      entity: 'invoices',
      entityId: ref.id,
      details: { numri: n, klienti: client.emri, monedha, totali, gjendjaPara, paguar, gjendjaRe, statusi, rregullim: diff || null },
      actorName,
    })
    return { id: ref.id, numri: n, numriTekst }
  })
}

// ---------- Anulimi ----------

/**
 * Anulon një faturë të lëshuar (me arsye). Kartela dhe stoku kthehen mbrapsht;
 * diferenca kalon te fatura që mban borxhin dhe statuset rillogariten.
 * Shumat e printuara te faturat e tjera nuk ndryshojnë.
 */
export async function cancelInvoice(id, arsye, actorName) {
  if (!arsye?.trim()) throw new Error('Arsyeja e anulimit është e detyrueshme.')
  const ref = invoiceRef(id)
  const uid = auth.currentUser.uid

  await runTransaction(db, async (tx) => {
    // ---------- leximet ----------
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Fatura nuk ekziston.')
    const X = snap.data()
    if (!ISSUED.includes(X.statusi)) throw new Error('Vetëm faturat e lëshuara mund të anulohen.')
    const { monedha, clientId } = X
    const clientRef = companyDoc('clients', clientId)
    const cSnap = await tx.get(clientRef)
    const client = cSnap.data()
    const settings = await readSettings(tx)
    const delta = -X.totali + X.paguar // efekti i kundërt në gjendje
    const latestId = client.faturaFundit?.[monedha]

    let plan = null
    let newLatestId = latestId
    let previous = null
    if (latestId === id) {
      // Fatura është më e fundit: borxhi kalon te e mëparshmja (kapërcen të anuluarat).
      let pid = X.faturaPara
      while (pid && !previous) {
        const ps = await tx.get(invoiceRef(pid))
        if (!ps.exists()) break
        if (ps.data().statusi === 'anuluar') pid = ps.data().faturaPara
        else previous = { id: pid, ref: ps.ref, data: ps.data() }
      }
      newLatestId = previous?.id ?? null
      if (previous) {
        // E mëparshmja bëhet "më e fundit" dhe mban gjendjen e re të klientit.
        const G2 = (client.gjendje?.[monedha] ?? 0) + delta
        plan = await planLatestChange(tx, { ...previous, data: { ...previous.data, mbetur: G2 } }, 0)
      }
    } else {
      const latest = await readIssued(tx, latestId)
      plan = await planLatestChange(tx, latest, delta)
      // Fatura e anuluar nuk shlyhet më si "pasuar"
      if (plan) plan.chain = plan.chain.filter((c) => c.id !== id)
    }

    // ---------- shkrimet ----------
    tx.update(ref, {
      statusi: 'anuluar',
      anuluar: { koha: serverTimestamp(), uid, emri: actorName ?? '', arsye: arsye.trim() },
      piketDhene: 0,
    })

    const pts = applyLatestChange(tx, plan, client, settings, latestId === id ? { faturaPas: null } : {})

    X.rreshtat.forEach((l, i) => {
      tx.update(companyDoc('invoiceLines', lineId(id, i)), { anuluar: true })
    })
    for (const m of aggregateByItem(X.rreshtat)) {
      writeMovement(tx, { itemId: m.itemId, sasia: m.sasia, tipi: 'kthim_anulim', dokument: 'anulim_fature', invoiceId: id, numri: X.numri }, actorName)
    }

    const now = serverTimestamp()
    const ledgerIds = []
    let bal = client.gjendje?.[monedha] ?? 0
    const addLedger = (fields) => {
      const lref = newDocRef('ledger')
      tx.set(lref, ledgerEntryData({ clientId, monedha, kursi: X.kursi, data: now, para: bal, faturaId: id, tipi: 'anulim', arsye, ...fields }, actorName))
      bal += fields.shuma
      ledgerIds.push(lref.id)
    }
    addLedger({ shuma: -X.totali, shenim: `Anulim i faturës #${X.numriTekst ?? X.numri}` })
    if (X.paguar > 0) addLedger({ shuma: X.paguar, shenim: `Kthim i pagesës së faturës #${X.numriTekst ?? X.numri}` })

    // Pikët: hiqen ato të faturës së anuluar, shtohen ato të faturave që u paguan tani.
    const net = pts.total - (X.piketDhene ?? 0)
    const pointsPatch = writePointsEntry(
      tx,
      {
        clientId,
        client,
        pike: net,
        tipi: net < 0 ? 'anulim_fature' : 'fituar',
        arsye: [
          X.piketDhene ? `Anulim i faturës #${X.numriTekst ?? X.numri} (−${X.piketDhene})` : '',
          pts.total ? `Fatura të paguara: ${numbersText(pts.paid.filter((i) => pts.per[i.id]))}` : '',
        ].filter(Boolean).join('; '),
        invoiceIds: [id, ...Object.keys(pts.per)],
      },
      actorName,
    )

    tx.update(clientRef, {
      [`gjendje.${monedha}`]: bal,
      [`faturaFundit.${monedha}`]: newLatestId,
      lastLedgerIds: ledgerIds,
      ...pointsPatch,
    })

    addAudit(tx, {
      action: 'anulim_fature',
      entity: 'invoices',
      entityId: id,
      details: { numri: X.numri, klienti: X.klient?.emri, totali: X.totali, paguar: X.paguar, arsye: arsye.trim() },
      actorName,
    })
  })
}

// ---------- Leximet ----------

export function watchInvoice(id, onData, onError) {
  return onSnapshot(companyDoc('invoices', id), (s) => onData(s.exists() ? { id: s.id, ...s.data() } : null), onError)
}

export const PAGE = 50

/**
 * Lista e faturave me filtra, nga serveri, me faqe (cursor).
 * filters: { clientId, statusi, monedha, from (Date), to (Date), min, max, numri }
 */
export async function queryInvoices(filters = {}, cursor = null) {
  const col = companyCol('invoices')
  const cons = []
  if (filters.numri) {
    const n = Number(filters.numri)
    const byNum = Number.isInteger(n) ? await getDocs(query(col, where('numri', '==', n))) : { docs: [] }
    const byOld = await getDocs(query(col, where('numriVjeter', '==', String(filters.numri).trim())))
    const seen = new Set()
    const rows = [...byNum.docs, ...byOld.docs].filter((d) => !seen.has(d.id) && seen.add(d.id)).map((d) => ({ id: d.id, ...d.data() }))
    return { rows, cursor: null, more: false }
  }
  if (filters.clientId) cons.push(where('clientId', '==', filters.clientId))
  if (filters.statusi) cons.push(where('statusi', '==', filters.statusi))
  if (filters.monedha) cons.push(where('monedha', '==', filters.monedha))
  const byAmount = filters.min != null || filters.max != null
  if (byAmount) {
    if (filters.min != null) cons.push(where('totali', '>=', filters.min))
    if (filters.max != null) cons.push(where('totali', '<=', filters.max))
    cons.push(orderBy('totali', 'desc'))
  } else {
    if (filters.from) cons.push(where('data', '>=', filters.from))
    if (filters.to) cons.push(where('data', '<=', filters.to))
    cons.push(orderBy('data', 'desc'))
  }
  if (cursor) cons.push(startAfter(cursor))
  cons.push(limit(PAGE + 1))
  const snap = await getDocs(query(col, ...cons))
  const docs = snap.docs.slice(0, PAGE)
  let rows = docs.map((d) => ({ id: d.id, ...d.data() }))
  // Kur filtrohet sipas shumës, periudha zbatohet mbi rezultatet.
  if (byAmount && (filters.from || filters.to)) {
    rows = rows.filter((r) => (!filters.from || millis(r.data) >= filters.from.getTime()) && (!filters.to || millis(r.data) <= filters.to.getTime()))
  }
  return { rows, cursor: docs[docs.length - 1] ?? null, more: snap.docs.length > PAGE }
}

export function watchDrafts(onData, onError) {
  return onSnapshot(
    query(companyCol('invoices'), where('statusi', '==', 'draft')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.ndryshuar) - millis(a.ndryshuar))),
    onError,
  )
}

/** Rreshtat e faturave (për statistikat e klientit / artikullit). */
export function watchLines(field, value, onData, onError) {
  return onSnapshot(
    query(companyCol('invoiceLines'), where(field, '==', value)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

/** Log-u i veprimeve për një dokument. */
export function watchAuditFor(entity, entityId, onData, onError) {
  return onSnapshot(
    query(companyCol('auditLog'), where('entity', '==', entity), where('entityId', '==', entityId)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.koha) - millis(a.koha))),
    onError,
  )
}

/** Log-u i të gjitha veprimeve, me faqe. */
export async function queryAuditLog(cursor = null) {
  const cons = [orderBy('koha', 'desc')]
  if (cursor) cons.push(startAfter(cursor))
  cons.push(limit(PAGE + 1))
  const snap = await getDocs(query(companyCol('auditLog'), ...cons))
  const docs = snap.docs.slice(0, PAGE)
  return { rows: docs.map((d) => ({ id: d.id, ...d.data() })), cursor: docs[docs.length - 1] ?? null, more: snap.docs.length > PAGE }
}

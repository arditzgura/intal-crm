import {
  count, documentId, getAggregateFromServer, sum,
  getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  startAfter, where, writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'
import { ledgerEntryData } from './ledgerService'
import { formatDocNumber } from './settingsService'
import { aggregateByItem, writeMovement } from './stockService'
import { writeCash } from './cashService'
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
      piketKlientit: client.rastesor ? null : Math.max(0, (client.piket ?? 0) + pts.total),
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
      return lref.id
    }
    if (diff) addLedger({ tipi: 'rregullim', shuma: diff, arsye: data.arsyeRregullimi, shenim: `Ndryshim i gjendjes së mëparshme te fatura #${numriTekst}` })
    addLedger({ tipi: 'fature', shuma: totali, shenim: `Fatura #${numriTekst}` })
    if (paguar > 0) {
      const pid = addLedger({ tipi: 'pagese', shuma: -paguar, metoda: data.metodaPagese, shenim: `Paguar te fatura #${numriTekst}` })
      writeCash(tx, { llogaria: data.metodaPagese, monedha, kursi, shuma: paguar, tipi: 'arketim', data: data.data, shenim: `${client.emri} – fatura #${numriTekst}`, clientId: data.clientId, ledgerId: pid, invoiceId: ref.id }, actorName)
    }

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
 * Nëse fatura kishte pagesë: `kthePagesen` = paratë i kthehen klientit (dalin nga
 * arka/banka); përndryshe paratë mbeten dhe klienti merr tepricë.
 */
export async function cancelInvoice(id, arsye, actorName, { kthePagesen = false } = {}) {
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
    const refund = kthePagesen && X.paguar > 0
    const delta = -X.totali + (refund ? X.paguar : 0) // efekti i kundërt në gjendje
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
      return lref.id
    }
    addLedger({ shuma: -X.totali, shenim: `Anulim i faturës #${X.numriTekst ?? X.numri}` })
    if (refund) {
      const lid = addLedger({ shuma: X.paguar, shenim: `Kthim i pagesës së faturës #${X.numriTekst ?? X.numri} (paratë iu kthyen klientit)` })
      writeCash(tx, { llogaria: X.metodaPagese ?? 'arke', monedha, kursi: X.kursi, shuma: -X.paguar, tipi: 'kthim_klientit', shenim: `${X.klient?.emri ?? ''} – anulim i faturës #${X.numriTekst ?? X.numri}`, clientId, ledgerId: lid, invoiceId: id }, actorName)
    }

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
      details: { numri: X.numri, klienti: X.klient?.emri, totali: X.totali, paguar: X.paguar, pagesa: X.paguar > 0 ? (refund ? 'u kthye' : 'mbeti tepricë') : null, arsye: arsye.trim() },
      actorName,
    })
  })
}

/**
 * Pagesat e regjistruara te fatura (lëvizjet "pagese" të kartelës me faturaId = fatura),
 * pa ato që janë anuluar tashmë, bashkë me lëvizjet e tyre në arkë/bankë.
 */
export async function paymentsOfInvoice(inv) {
  const skip = new Set(inv.pagesatAnuluara ?? [])
  const snap = await getDocs(query(companyCol('ledger'), where('faturaId', '==', inv.id)))
  const payments = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.tipi === 'pagese' && e.shuma < 0 && !skip.has(e.id))
  const cash = []
  for (const p of payments) {
    const c = await getDocs(query(companyCol('cashMovements'), where('ledgerId', '==', p.id)))
    for (const d of c.docs) cash.push({ id: d.id, ...d.data() })
  }
  return { payments, cash, total: payments.reduce((a, p) => a - p.shuma, 0) }
}

/**
 * Heq shenjën "E paguar" nga fatura e fundit e klientit, kur u shënua gabimisht e paguar:
 * njësoj sikur fatura të ruhej sërish pa pagesë. Në një transaction:
 *  - kartela: lëvizje "anulim_pagese" (+ shuma e pagesave), borxhi rritet sërish;
 *  - arka/banka: lëvizja e kundërt e çdo arkëtimi (pagesat e vjetra nuk fshihen);
 *  - fatura: paguar = 0, gjendjaRe = gjendjaPara + totali, mbetur += shuma → "Pa paguar";
 *    (lejohet vetëm te fatura e fundit: asnjë faturë tjetër nuk varet nga gjendja e saj);
 *  - faturat "Pasuar" që u bënë "E paguar" me këtë pagesë kthehen "Pasuar";
 *  - pikët e dhëna për to hiqen.
 */
export async function unmarkPaid(id, arsye, actorName) {
  arsye = arsye?.trim() || 'U shënua gabimisht e paguar'
  const pre = await getDoc(invoiceRef(id))
  if (!pre.exists()) throw new Error('Fatura nuk ekziston.')
  const found = await paymentsOfInvoice({ id, ...pre.data() })
  if (!found.total) throw new Error('Kjo faturë nuk ka pagesa të regjistruara për t\'u hequr (mund të jetë mbyllur me tepricë të klientit).')

  const entryRef = newDocRef('ledger')
  await runTransaction(db, async (tx) => {
    // --- leximet ---
    const invSnap = await tx.get(invoiceRef(id))
    const X = invSnap.data()
    if (X.statusi !== 'e_paguar') throw new Error('Vetëm faturat "E paguar" mund të kthehen në "Pa paguar".')
    const clientRef = companyDoc('clients', X.clientId)
    const cSnap = await tx.get(clientRef)
    const client = cSnap.data()
    if (client.faturaFundit?.[X.monedha] !== id) throw new Error('Lejohet vetëm te fatura e fundit e klientit.')
    if ((X.pagesatAnuluara ?? []).some((p) => found.payments.some((f) => f.id === p))) throw new Error('Pagesa është anuluar tashmë. Rifreskoni faqen.')
    // Faturat para saj me borxh të bartur që u mbyllën nga kjo pagesë → "Pasuar"
    const back = []
    let pid = X.faturaPara
    for (let i = 0; pid && i < 1000; i++) {
      const s = await tx.get(invoiceRef(pid))
      if (!s.exists()) break
      const d = s.data()
      if (d.statusi === 'anuluar') { pid = d.faturaPara; continue }
      if (d.statusi !== 'e_paguar' || !(d.gjendjaRe > 0)) break
      back.push({ id: pid, ref: s.ref, data: d })
      pid = d.faturaPara
    }

    // --- shkrimet ---
    const shuma = found.total
    const para = client.gjendje?.[X.monedha] ?? 0
    const shenim = `Anulim pagese – fatura #${X.numriTekst}`
    tx.set(entryRef, ledgerEntryData({ clientId: X.clientId, tipi: 'anulim_pagese', monedha: X.monedha, kursi: X.kursi, shuma, data: new Date(), para, shenim, arsye: arsye.trim(), faturaId: id }, actorName))
    for (const c of found.cash) {
      writeCash(tx, { llogaria: c.llogaria, monedha: c.monedha, kursi: c.kursi, shuma: -c.shuma, tipi: 'anulim_pagese', data: new Date(), shenim: `${client.emri} – ${shenim}`, clientId: X.clientId, ledgerId: entryRef.id, invoiceId: id }, actorName)
    }
    const mbetur = X.mbetur + shuma
    const gjendjaRe = X.gjendjaPara + X.totali
    tx.update(invSnap.ref, {
      statusi: mbetur > 0 ? 'pa_paguar' : 'e_paguar',
      mbetur,
      paguar: 0,
      gjendjaRe,
      piketDhene: 0,
      pagesatAnuluara: [...(X.pagesatAnuluara ?? []), ...found.payments.map((p) => p.id)],
    })
    for (const b of back) tx.update(b.ref, { statusi: 'pasuar', piketDhene: 0 })

    const pike = (X.piketDhene ?? 0) + back.reduce((a, b) => a + (b.data.piketDhene ?? 0), 0)
    const pointsPatch = client.rastesor ? {} : writePointsEntry(
      tx,
      { clientId: X.clientId, client, pike: -pike, tipi: 'anulim_pagese', arsye: `Pagesa e faturës #${X.numriTekst} u anulua`, invoiceIds: [id, ...back.map((b) => b.id)] },
      actorName,
    )
    tx.update(clientRef, { [`gjendje.${X.monedha}`]: para + shuma, lastLedgerIds: [entryRef.id], ...pointsPatch })
    addAudit(tx, {
      action: 'anulim_pagese',
      entity: 'invoices',
      entityId: id,
      details: {
        numri: X.numri, klienti: client.emri, monedha: X.monedha, shuma, arsye: arsye.trim(),
        paguarPara: X.paguar, gjendjaRePara: X.gjendjaRe, gjendjaRe, pagesat: found.payments.map((p) => p.id),
        pasuarSerish: back.map((b) => b.data.numri),
      },
      actorName,
    })
  })
  return entryRef.id
}

/**
 * Korrigjim i një fature të lëshuar: fatura anulohet (pagesa mbetet si tepricë
 * e klientit, ndaj kalon vetë te fatura e re si gjendje e mëparshme) dhe krijohet
 * një draft i ri me të njëjtat të dhëna, që ndryshohet dhe lëshohet me numër të ri.
 * @returns id e draftit të ri
 */
export async function correctInvoice(id, arsye, actorName) {
  if (!arsye?.trim()) throw new Error('Arsyeja e korrigjimit është e detyrueshme.')
  await cancelInvoice(id, `Korrigjim: ${arsye.trim()}`, actorName, { kthePagesen: false })
  const X = (await getDoc(invoiceRef(id))).data()
  const client = (await getDoc(companyDoc('clients', X.clientId))).data()
  return saveDraft(null, {
    clientId: X.clientId,
    client,
    monedha: X.monedha,
    kursi: X.kursi,
    data: X.data,
    rreshtat: X.rreshtat,
    shenime: X.shenime ?? '',
    paguar: 0,
    metodaPagese: X.metodaPagese ?? 'arke',
  }, actorName)
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
  if (filters.clientIds?.length) cons.push(where('clientId', 'in', filters.clientIds.slice(0, 30)))
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
  if (filters.limit) {
    // N faturat e para të filtrit (për bashkimin e disa kërkesave "in", p.sh. filtri i qytetit).
    const snap = await getDocs(query(col, ...cons, limit(filters.limit)))
    return { rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), cursor: null, more: false }
  }
  if (filters.all) {
    // Pa faqe (p.sh. për raportin): të gjitha faturat e filtrit, max 5000.
    const snap = await getDocs(query(col, ...cons, limit(5000)))
    return { rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), cursor: null, more: false }
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

const rangeCons = ({ from, to } = {}) => [...(from ? [where('data', '>=', from)] : []), ...(to ? [where('data', '<=', to)] : [])]

/** Id-të e faturave (më e reja e para) që përmbajnë një nga artikujt (max 30). */
export async function invoiceIdsForItems(itemIds, range) {
  if (!itemIds.length) return []
  const snap = await getDocs(query(companyCol('invoiceLines'), where('itemId', 'in', itemIds.slice(0, 30)), ...rangeCons(range), orderBy('data', 'desc'), limit(3000)))
  const seen = new Set()
  const ids = []
  for (const d of snap.docs) {
    const id = d.data().invoiceId
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** Faturat sipas id-ve, në të njëjtin rend. */
export async function invoicesByIds(ids) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30)
    const snap = await getDocs(query(companyCol('invoices'), where(documentId(), 'in', chunk)))
    snap.docs.forEach((d) => out.set(d.id, { id: d.id, ...d.data() }))
  }
  return ids.map((id) => out.get(id)).filter(Boolean)
}

/**
 * Agregim nga serveri me një kërkesë për çdo fushë: Firestore kërkon indeks të veçantë për
 * çdo kombinim fushash të mbledhura, ndaj secila sum/count shkon më vete dhe bashkohet këtu.
 * Kthen { alias: vlera } (si r.data()).
 */
async function aggregate(q, spec) {
  const entries = await Promise.all(Object.entries(spec).map(async ([k, a]) => [k, (await getAggregateFromServer(q, { [k]: a })).data()[k]]))
  return Object.fromEntries(entries)
}

/**
 * Përmbledhja e periudhës, e llogaritur nga serveri (sum / count) pa lexuar faturat:
 * numri i faturave, shitjet, arkëtimet (pagesat e klientëve) dhe borxhi i papaguar,
 * secila sipas monedhës. Faturat e anuluara dhe draftet nuk përfshihen.
 */
export async function invoiceSummary(range) {
  const out = { count: 0, sales: {}, receipts: {}, unpaid: {}, receiptsError: false }
  await Promise.all(['LEK', 'EUR', 'USD'].map(async (cur) => {
    const inv = companyCol('invoices')
    // Një kërkesë për çdo status (barazi) – përdor indekset (monedha, statusi[, data]).
    const perStatus = await Promise.all(ISSUED.map((st) =>
      aggregate(query(inv, where('monedha', '==', cur), where('statusi', '==', st), ...rangeCons(range)), { n: count(), s: sum('totali'), ...(st === 'pa_paguar' ? { m: sum('mbetur') } : {}) }),
    ))
    perStatus.forEach((r, i) => {
      out.count += r.n
      if (r.s) out.sales[cur] = (out.sales[cur] ?? 0) + r.s
      if (ISSUED[i] === 'pa_paguar' && r.m) out.unpaid[cur] = r.m
    })
    try {
      const c = await getAggregateFromServer(query(companyCol('ledger'), where('tipi', '==', 'pagese'), where('monedha', '==', cur), ...rangeCons(range)), { s: sum('shuma') })
      if (c.data().s) out.receipts[cur] = -c.data().s
    } catch {
      out.receiptsError = true
    }
  }))
  return out
}

/**
 * Fitimi i periudhës (LEK) me koston aktuale të artikujve: Σ (shitja − sasia × kosto),
 * me sum-e nga serveri për çdo artikull që ka kosto.
 */
export async function invoiceProfit(range, itemIds, costs) {
  let profit = 0
  const withCost = itemIds.filter((id) => costs[id] != null)
  for (let i = 0; i < withCost.length; i += 20) {
    await Promise.all(withCost.slice(i, i + 20).map(async (itemId) => {
      const r = await aggregate(
        query(companyCol('invoiceLines'), where('itemId', '==', itemId), where('monedha', '==', 'LEK'), where('anuluar', '==', false), ...rangeCons(range)),
        { t: sum('totali'), q: sum('sasia') },
      )
      profit += (r.t ?? 0) - (r.q ?? 0) * costs[itemId]
    }))
  }
  return profit
}

/**
 * Shitjet e çdo artikulli në periudhë (faturat në LEK, pa të anuluarat), me sum nga serveri:
 * { itemId: { totali, sasia } }.
 */
export async function itemSalesTotals(itemIds, range) {
  const out = {}
  for (let i = 0; i < itemIds.length; i += 20) {
    await Promise.all(itemIds.slice(i, i + 20).map(async (itemId) => {
      const r = await aggregate(
        query(companyCol('invoiceLines'), where('itemId', '==', itemId), where('monedha', '==', 'LEK'), where('anuluar', '==', false), ...rangeCons(range)),
        { t: sum('totali'), q: sum('sasia') },
      )
      out[itemId] = { totali: r.t ?? 0, sasia: r.q ?? 0 }
    }))
  }
  return out
}

/** Shitjet (LEK) për 12 muajt e fundit: [{ key: 'YYYY-MM', totali, fatura }], sum/count nga serveri. */
export async function monthlySales(months = 12) {
  const now = new Date()
  const list = Array.from({ length: months }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1))
  return Promise.all(list.map(async (d) => {
    const from = new Date(d.getFullYear(), d.getMonth(), 1)
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    // Një kërkesë për çdo status (barazi), pa "in" – përdor indeksin (monedha, statusi, data).
    const parts = await Promise.all(ISSUED.map((st) => aggregate(
      query(companyCol('invoices'), where('monedha', '==', 'LEK'), where('statusi', '==', st), ...rangeCons({ from, to })),
      { t: sum('totali'), n: count() },
    )))
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      totali: parts.reduce((a, r) => a + (r.t ?? 0), 0),
      fatura: parts.reduce((a, r) => a + r.n, 0),
    }
  }))
}

/** Numri i radhës së faturës (vetëm për shfaqje; numri jepet në lëshim). */
export function watchNextInvoiceNumber(onData, onError) {
  return onSnapshot(companyDoc('counters', 'invoices'), (s) => onData(s.exists() ? s.data().next : 1), onError)
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

import { toLek } from '../utils/money'
import { millis } from '../utils/date'
import { costAt } from './itemService'

/**
 * Përmbledhje e rreshtave të faturave (invoiceLines), pa të anuluarat.
 * groupBy: 'itemId' (artikujt e blerë nga klienti) | 'clientId' (kush e bleu artikullin).
 * Fitimi llogaritet në LEK me koston në datën e faturës (vetëm kur jepet `costs`).
 */
export function aggregateLines(lines, { groupBy, from, to, costs = null }) {
  const groups = new Map()
  const totals = {} // sipas monedhës
  let totalLek = 0
  let profitLek = 0
  let profitKnown = true
  const invoices = new Set()

  for (const l of lines) {
    if (l.anuluar) continue
    const t = millis(l.data)
    if (from && t < from.getTime()) continue
    if (to && t > to.getTime()) continue

    const lek = toLek(l.totali, l.kursi)
    let profit = null
    if (costs) {
      const c = costAt(l.itemId, t, costs.history, costs.current)
      if (c != null) profit = lek - l.sasia * c
    }

    const key = `${l[groupBy]}|${l.monedha}`
    const g = groups.get(key) ?? { key: l[groupBy], monedha: l.monedha, sasia: 0, totali: 0, totalLek: 0, fitimi: 0, fitimiIPlote: true, fatura: new Set(), eFundit: 0 }
    g.sasia += l.sasia
    g.totali += l.totali
    g.totalLek += lek
    if (profit == null) g.fitimiIPlote = false
    else g.fitimi += profit
    g.fatura.add(l.invoiceId)
    g.eFundit = Math.max(g.eFundit, t)
    groups.set(key, g)

    totals[l.monedha] = (totals[l.monedha] ?? 0) + l.totali
    totalLek += lek
    if (profit == null) profitKnown = false
    else profitLek += profit
    invoices.add(l.invoiceId)
  }

  const rows = [...groups.values()]
    .map((g) => ({ ...g, fatura: g.fatura.size, cmimiMesatar: g.sasia ? Math.round(g.totali / g.sasia) : 0 }))
    .sort((a, b) => b.totalLek - a.totalLek)
  return { rows, totals, totalLek, profitLek, profitKnown, invoiceCount: invoices.size }
}

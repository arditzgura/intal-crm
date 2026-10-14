import { useMemo, useState } from 'react'
import { Printer, Download } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import { buildStatement } from '../../services/ledgerService'
import { LEDGER_TYPES, PAYMENT_METHODS } from '../../config/ledger'
import { CURRENCIES, formatMoney } from '../../utils/money'
import { endOfDay, formatDate, startOfDay, toInputDate } from '../../utils/date'
import { downloadCsv } from '../../utils/csv'
import Balance from '../../components/Balance'

const describe = (e) =>
  [
    LEDGER_TYPES[e.tipi]?.label ?? e.tipi,
    e.metoda ? `(${PAYMENT_METHODS[e.metoda]})` : '',
  ].filter(Boolean).join(' ')

/** Kartela + ekstrakt llogarie për periudhë, me printim dhe eksport CSV. */
export default function LedgerTab({ client, ledger }) {
  const { settings } = useSettings()
  const used = Object.keys(CURRENCIES).filter((c) => ledger.some((e) => e.monedha === c))
  const [monedha, setMonedha] = useState(used.includes(client.monedhaPreferuar) ? client.monedhaPreferuar : (used[0] ?? 'LEK'))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(toInputDate())

  const st = useMemo(
    () => buildStatement(ledger, monedha, from ? startOfDay(from) : null, to ? endOfDay(to) : null),
    [ledger, monedha, from, to],
  )
  const k = settings.kompania

  function exportCsv() {
    const rows = [
      ['', 'Gjendja hapëse', '', '', '', formatMoney(st.hapese)],
      ...st.rows.map((e) => [
        formatDate(e.data),
        describe(e),
        e.shenim || e.arsye || '',
        e.shuma > 0 ? formatMoney(e.shuma) : '',
        e.shuma < 0 ? formatMoney(-e.shuma) : '',
        formatMoney(e.gjendjaPas),
      ]),
      ['', 'Gjendja mbyllëse', '', formatMoney(st.debi), formatMoney(st.kredi), formatMoney(st.mbyllese)],
    ]
    downloadCsv(
      `kartela_${client.kodi}_${monedha}_${from || 'fillim'}_${to || 'sot'}.csv`,
      ['Data', 'Lloji', 'Shënim', `Debi (${monedha})`, `Kredi (${monedha})`, 'Gjendja'],
      rows,
    )
  }

  return (
    <div className="card printable">
      <div className="filters no-print">
        <select value={monedha} onChange={(e) => setMonedha(e.target.value)}>
          {Object.keys(CURRENCIES).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="inline-field">Nga <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline-field">Deri <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <span className="grow" />
        <button className="btn" onClick={() => window.print()}><Printer size={16} /> Printo ekstraktin</button>
        <button className="btn" onClick={exportCsv}><Download size={16} /> CSV</button>
      </div>

      <div className="print-only print-header">
        {k.logo && <img src={k.logo} alt="" className="print-logo" />}
        <div>
          <h2>{k.emri}</h2>
          <div className="small">{[k.nipt && `NIPT: ${k.nipt}`, k.adresa, k.telefoni].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="print-only">
        <h2>Ekstrakt llogarie – {monedha}</h2>
        <p>
          <b>{client.emri}</b> ({client.kodi}){client.nipt && ` · NIPT ${client.nipt}`}{client.qyteti && ` · ${client.qyteti}`}
          <br />
          Periudha: {from ? formatDate(startOfDay(from)) : 'nga fillimi'} – {to ? formatDate(startOfDay(to)) : 'sot'}
        </p>
      </div>

      <div className="table-wrap">
        <table className="table statement">
          <thead>
            <tr>
              <th>Data</th>
              <th>Lloji</th>
              <th>Shënim</th>
              <th className="num">Debi</th>
              <th className="num">Kredi</th>
              <th className="num">Gjendja</th>
            </tr>
          </thead>
          <tbody>
            <tr className="subtotal">
              <td colSpan={5}>Gjendja hapëse</td>
              <td className="num"><Balance value={st.hapese} currency={monedha} showLabel /></td>
            </tr>
            {st.rows.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.data)}</td>
                <td>{describe(e)}</td>
                <td className="wrap">
                  {e.shenim || e.arsye}
                  {e.emri && <span className="muted small no-print"> · {e.emri}</span>}
                </td>
                <td className="num">{e.shuma > 0 ? formatMoney(e.shuma) : ''}</td>
                <td className="num">{e.shuma < 0 ? formatMoney(-e.shuma) : ''}</td>
                <td className="num"><Balance value={e.gjendjaPas} currency={monedha} /></td>
              </tr>
            ))}
            {!st.rows.length && (
              <tr><td colSpan={6} className="muted">Asnjë lëvizje në këtë periudhë.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="subtotal">
              <td colSpan={3}>Gjendja mbyllëse</td>
              <td className="num">{formatMoney(st.debi)}</td>
              <td className="num">{formatMoney(st.kredi)}</td>
              <td className="num"><Balance value={st.mbyllese} currency={monedha} showLabel /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small no-print">
        Debi = rrit detyrimin (faturë, postë, gjendje fillestare). Kredi = e ul (pagesë, kthim, zbritje).
        Lëvizjet nuk fshihen; gabimet korrigjohen me "Rregullim gjendjeje".
      </p>
    </div>
  )
}

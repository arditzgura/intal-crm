import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { SupplierPaymentModal } from '../finance/FinanceModals'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchSupplierLedger } from '../../services/purchaseService'
import { errorMessage } from '../../services/authService'
import { formatMoney } from '../../utils/money'
import { formatDate } from '../../utils/date'
import { PurchaseList } from '../purchases/PurchasesPage'

const TYPES = { blerje: 'Blerje (hyrje malli)', anulim_blerje: 'Anulim hyrjeje', pagese_furnitori: 'Pagesë furnitorit', anulim_pagese: 'Anulim pagese', rregullim: 'Rregullim' }

/** Detyrimi ndaj furnitorit (veçmas nga kartela e klientit) dhe hyrjet e tij. */
export default function SupplierTab({ client }) {
  const { perms } = useAuth()
  const { data: entries, error } = useLive((ok, ko) => watchSupplierLedger(client.id, ok, ko), [client.id], { initial: [] })
  const balances = Object.entries(client.detyrimFurnitori ?? {}).filter(([, v]) => v)
  const [paying, setPaying] = useState(false)

  const run = {}
  const rows = entries.map((e) => {
    run[e.monedha] = (run[e.monedha] ?? 0) + e.shuma
    return { ...e, pas: run[e.monedha] }
  }).reverse()

  return (
    <>
      <div className="card">
        <div className="card-head-row">
          <h3>Detyrimi ndaj furnitorit</h3>
          {perms.has('financa_furnitore') && (
            <button className="btn primary" onClick={() => setPaying(true)}><Wallet size={16} /> Paguaj furnitorin</button>
          )}
        </div>
        <div className="balance-cards">
          {balances.length ? balances.map(([c, v]) => (
            <div key={c} className={`balance-card ${v > 0 ? 'debt' : 'credit'}`}>
              <div className="balance-card-label">{c}</div>
              <div className="balance-card-value">{formatMoney(Math.abs(v), c)}</div>
              <div className="balance-card-sub">{v > 0 ? 'I detyrohemi furnitorit' : 'Furnitori na detyrohet (parapagim)'}</div>
            </div>
          )) : <p className="muted">Nuk ka detyrim ndaj këtij furnitori.</p>}
        </div>
        <p className="muted small">Ky detyrim mbahet veçmas dhe nuk ndikon në faturat e klientit. Pagesat dalin nga arka/banka te Financa.</p>
      </div>

      <div className="card no-pad">
        {error && <div className="alert error">{errorMessage(error)}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Lloji</th><th>Shënim</th><th className="num">Shuma</th><th className="num">Detyrimi pas</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.data)}</td>
                  <td>{TYPES[e.tipi] ?? e.tipi}</td>
                  <td className="wrap">{e.purchaseId ? <Link to={`/blerje/${e.purchaseId}`}>{e.shenim}</Link> : e.shenim}</td>
                  <td className={`num ${e.shuma > 0 ? 'neg' : 'pos'}`}>{formatMoney(e.shuma, e.monedha)}</td>
                  <td className="num">{formatMoney(e.pas, e.monedha)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">Asnjë lëvizje.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {paying && <SupplierPaymentModal supplier={client} onClose={() => setPaying(false)} />}
      {perms.has('mod_blerje') && (
        <>
          <h3>Hyrjet e mallit nga ky furnitor</h3>
          <PurchaseList fixedSupplierId={client.id} />
        </>
      )}
    </>
  )
}

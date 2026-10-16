import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Wallet, Pencil, SlidersHorizontal, Archive, ArchiveRestore } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClient, setClientArchived } from '../../services/clientService'
import { watchClientLedger } from '../../services/ledgerService'
import { errorMessage } from '../../services/authService'
import { CLIENT_TYPES, canEditClients, canLedger, canAdjustPoints, OTHER_MOVEMENTS } from '../../config/ledger'
import { CURRENCIES, formatMoney } from '../../utils/money'
import { formatDate, millis, periodRange } from '../../utils/date'
import PeriodFilter, { defaultPeriod } from '../../components/PeriodFilter'
import Balance from '../../components/Balance'
import ClientFormModal from './ClientFormModal'
import LedgerEntryModal from './LedgerEntryModal'
import PointsModal from './PointsModal'
import PointsTab from './PointsTab'
import ClientPricesTab from './ClientPricesTab'
import { InvoiceList } from '../invoices/HistoryPage'
import ClientPurchases from './ClientPurchases'
import SupplierTab from './SupplierTab'

const TABS = [
  ['faturat', 'Faturat'],
  ['blerjet', 'Artikujt e blerë'],
  ['piket', 'Pikët'],
  ['cmimet', 'Çmimet preferenciale'],
]

export default function ClientProfilePage() {
  const { id } = useParams()
  const { perms, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('skeda')) || params.get('skeda') === 'furnitori' ? params.get('skeda') : 'faturat'
  const [period, setPeriod] = useState(defaultPeriod)
  const range = useMemo(() => periodRange(period), [period])
  const [modal, setModal] = useState(null)

  const { data: client, loading, error } = useLive((ok, ko) => watchClient(id, ok, ko), [id])
  const { data: ledger, error: ledgerError } = useLive((ok, ko) => watchClientLedger(id, ok, ko), [id], { initial: [] })

  if (loading) return <div className="card muted">Duke u ngarkuar…</div>
  if (error) return <div className="alert error">{errorMessage(error)}</div>
  if (!client) return <div className="card">Klienti nuk u gjet. <Link to="/kliente">Kthehu te lista</Link></div>

  const balances = Object.keys(CURRENCIES).filter((c) => client.gjendje?.[c] || c === (client.monedhaPreferuar || 'LEK'))
  const payments = ledger.filter((e) => e.tipi === 'pagese')
  const lastPayment = payments.reduce((a, b) => (!a || millis(b.data) > millis(a.data) ? b : a), null)
  const invoiced = {}
  for (const e of ledger.filter((x) => x.tipi === 'fature')) invoiced[e.monedha] = (invoiced[e.monedha] ?? 0) + e.shuma

  const editable = canEditClients(perms)
  const canOther = OTHER_MOVEMENTS.some((t) => canLedger(perms, t))

  async function toggleArchive() {
    const msg = client.arkivuar ? 'Të riaktivizohet klienti?' : 'Të arkivohet klienti? Nuk fshihet; thjesht fshihet nga lista.'
    if (!window.confirm(msg)) return
    try {
      await setClientArchived(client.id, !client.arkivuar, profile?.emri)
    } catch (err) {
      window.alert(err.code ? errorMessage(err) : err.message)
    }
  }

  return (
    <div>
      <Link to="/kliente" className="back-link no-print"><ArrowLeft size={16} /> Klientë</Link>

      <div className="card client-head no-print">
        <div className="client-title">
          <div>
            <h1>
              {client.emri}
              {client.arkivuar && <span className="tag muted-tag">Arkivuar</span>}
            </h1>
            <div className="muted">
              <span className="mono">{client.kodi}</span> · {CLIENT_TYPES[client.tipi]}
              {client.qyteti && ` · ${client.qyteti}`}
            </div>
          </div>
          <div className="actions">
            {canLedger(perms, 'pagese') && (
              <button className="btn primary" onClick={() => setModal('pagese')}><Wallet size={16} /> Regjistro pagesë</button>
            )}
            {canOther && <button className="btn" onClick={() => setModal('tjeter')}>Lëvizje tjetër</button>}
            {canLedger(perms, 'rregullim') && (
              <button className="btn" onClick={() => setModal('rregullim')}><SlidersHorizontal size={16} /> Rregullim gjendjeje</button>
            )}
            {editable && <button className="btn" onClick={() => setModal('edit')}><Pencil size={16} /> Ndrysho</button>}
            {editable && !client.rastesor && (
              <button className="btn" onClick={toggleArchive} title={client.arkivuar ? 'Riaktivizo' : 'Arkivo'}>
                {client.arkivuar ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </button>
            )}
          </div>
        </div>

        <div className="details-grid">
          <Detail label="NIPT" value={client.nipt} />
          <Detail label="Telefoni" value={client.telefoni} />
          <Detail label="Email" value={client.email} />
          <Detail label="Adresa" value={client.adresa} />
          <Detail label="Monedha e preferuar" value={client.monedhaPreferuar} />
          <Detail label="Pagesa e fundit" value={lastPayment ? `${formatMoney(-lastPayment.shuma, lastPayment.monedha)} · ${formatDate(lastPayment.data)}` : '—'} />
          <Detail label="Totali i blerë" value={Object.keys(invoiced).length ? Object.entries(invoiced).map(([c, v]) => formatMoney(v, c)).join(' · ') : '—'} />
          <Detail label="Pikët" value={client.rastesor ? 'Nuk mbledh pikë' : String(client.piket ?? 0)} />
        </div>
        {client.shenime && <p className="notes">{client.shenime}</p>}

        <div className="balance-cards">
          {balances.map((c) => {
            const v = client.gjendje?.[c] ?? 0
            return (
              <div key={c} className={`balance-card ${v > 0 ? 'debt' : v < 0 ? 'credit' : ''}`}>
                <div className="balance-card-label">Gjendja {c}</div>
                <div className="balance-card-value"><Balance value={v} currency={c} /></div>
                <div className="balance-card-sub">{v > 0 ? 'DETYRIM – klienti na detyrohet' : v < 0 ? 'TEPRICË – i detyrohemi klientit' : 'Pa detyrim'}</div>
              </div>
            )
          })}
        </div>
        {canLedger(perms, 'gjendje_fillestare') && Object.keys(CURRENCIES).some((c) => !client.fillestare?.[c]) && (
          <button className="btn link small" onClick={() => setModal('gjendje_fillestare')}>
            + Vendos gjendjen fillestare
          </button>
        )}
      </div>

      <div className="tabs no-print" role="tablist">
        {[...TABS, ...(client.tipi !== 'klient' ? [['furnitori', 'Furnitori']] : [])].map(([k, label]) => (
          <button key={k} role="tab" className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParams({ skeda: k })}>
            {label}
          </button>
        ))}
      </div>

      {ledgerError && <div className="alert error">{errorMessage(ledgerError)}</div>}
      {tab !== 'furnitori' && (
        <div className="card period-card no-print"><PeriodFilter period={period} setPeriod={setPeriod} /></div>
      )}
      {tab === 'faturat' && <InvoiceList fixedClientId={client.id} period={period} setPeriod={setPeriod} />}
      {tab === 'blerjet' && <ClientPurchases client={client} range={range} />}
      {tab === 'piket' && (
        <PointsTab
          client={client}
          range={range}
          onAdjust={canAdjustPoints(perms) && !client.rastesor ? () => setModal('piket') : null}
        />
      )}
      {tab === 'cmimet' && <ClientPricesTab client={client} />}
      {tab === 'furnitori' && <SupplierTab client={client} />}

      {modal === 'edit' && <ClientFormModal client={client} onClose={() => setModal(null)} />}
      {['pagese', 'tjeter', 'rregullim', 'gjendje_fillestare'].includes(modal) && (
        <LedgerEntryModal mode={modal} client={client} onClose={() => setModal(null)} />
      )}
      {modal === 'piket' && <PointsModal client={client} onClose={() => setModal(null)} />}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div className="detail">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value || '—'}</div>
    </div>
  )
}

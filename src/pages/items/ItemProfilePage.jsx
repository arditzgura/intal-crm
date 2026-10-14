import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchItem, watchItemCost, setItemArchived } from '../../services/itemService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { canEditItems } from '../../config/ledger'
import { formatMoney } from '../../utils/money'
import { formatDate } from '../../utils/date'
import ItemFormModal from './ItemFormModal'
import ItemPricesSection from './ItemPricesSection'

const TABS = [
  ['detajet', 'Detajet'],
  ['cmimet', 'Çmimet preferenciale'],
  ['shitjet', 'Shitjet'],
  ['stoku', 'Lëvizjet e stokut'],
]

export default function ItemProfilePage() {
  const { id } = useParams()
  const { perms, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('skeda') ?? 'detajet'
  const [editing, setEditing] = useState(false)
  const showCost = canSeeCost(perms)
  const editable = canEditItems(perms)

  const { data: item, loading, error } = useLive((ok, ko) => watchItem(id, ok, ko), [id])
  const { data: cost } = useLive((ok, ko) => watchItemCost(id, ok, ko), [id], { enabled: showCost })

  if (loading) return <div className="card muted">Duke u ngarkuar…</div>
  if (error) return <div className="alert error">{errorMessage(error)}</div>
  if (!item) return <div className="card">Artikulli nuk u gjet. <Link to="/artikujt">Kthehu te lista</Link></div>

  const margin = showCost && cost != null && item.cmimi ? item.cmimi - cost : null

  async function toggleArchive() {
    const msg = item.arkivuar ? 'Të riaktivizohet artikulli?' : 'Të arkivohet artikulli? Nuk fshihet; thjesht nuk shfaqet më te lista.'
    if (!window.confirm(msg)) return
    try {
      await setItemArchived(item.id, !item.arkivuar, profile?.emri)
    } catch (err) {
      window.alert(err.code ? errorMessage(err) : err.message)
    }
  }

  return (
    <div>
      <Link to="/artikujt" className="back-link"><ArrowLeft size={16} /> Artikujt</Link>

      <div className="card client-head">
        <div className="client-title">
          <div>
            <h1>
              {item.emri}
              {item.arkivuar && <span className="tag muted-tag">Arkivuar</span>}
            </h1>
            <div className="muted">
              <span className="mono">{item.kodi}</span>
              {item.kategoria && ` · ${[item.kategoria, item.nenkategoria].filter(Boolean).join(' / ')}`}
              {` · ${item.njesia}`}
            </div>
          </div>
          {editable && (
            <div className="actions">
              <button className="btn" onClick={() => setEditing(true)}><Pencil size={16} /> Ndrysho</button>
              <button className="btn" onClick={toggleArchive} title={item.arkivuar ? 'Riaktivizo' : 'Arkivo'}>
                {item.arkivuar ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </button>
            </div>
          )}
        </div>

        <div className="balance-cards">
          <Stat label="Çmimi i shitjes" value={formatMoney(item.cmimi, 'LEK')} />
          {showCost && <Stat label="Kosto (çmimi i blerjes)" value={cost != null ? formatMoney(cost, 'LEK') : '—'} />}
          {showCost && (
            <Stat
              label="Marzhi për njësi"
              value={margin != null ? formatMoney(margin, 'LEK') : '—'}
              sub={margin != null ? `${Math.round((margin * 1000) / item.cmimi) / 10}% e çmimit` : 'Vendosni koston'}
            />
          )}
          <Stat label="Stoku" value="—" sub="Llogaritet nga Inventari (Faza 4)" />
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParams({ skeda: k })}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'detajet' && (
        <div className="card">
          <div className="details-grid">
            <Detail label="Kodi" value={item.kodi} />
            <Detail label="Emri" value={item.emri} />
            <Detail label="Kategoria" value={item.kategoria} />
            <Detail label="Nënkategoria" value={item.nenkategoria} />
            <Detail label="Njësia" value={item.njesia} />
            <Detail label="Stoku minimal" value={item.stokMinimal ? String(item.stokMinimal) : ''} />
            <Detail label="Krijuar më" value={formatDate(item.krijuar)} />
          </div>
        </div>
      )}
      {tab === 'cmimet' && (
        <>
          <p className="muted small">
            Te Fatura e Re, çmimi merret automatikisht: 1) çmimi preferencial i klientit, 2) përndryshe
            çmimi standard ({formatMoney(item.cmimi, 'LEK')}).
          </p>
          <ItemPricesSection item={item} readOnly={!editable} />
        </>
      )}
      {tab === 'shitjet' && (
        <Placeholder
          title="Shitjet e artikullit"
          text={`Nga Faza 3: kush e ka blerë, sasia, çmimi, totali${showCost ? ' dhe fitimi' : ''}, me totale sipas periudhës.`}
        />
      )}
      {tab === 'stoku' && (
        <Placeholder title="Lëvizjet e stokut" text="Nga Faza 4: hyrjet, daljet dhe rregullimet e inventarit për këtë artikull." />
      )}

      {editing && (
        <ItemFormModal item={item} cost={cost ?? undefined} showCost={showCost} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="balance-card">
      <div className="balance-card-label">{label}</div>
      <div className="balance-card-value">{value}</div>
      {sub && <div className="balance-card-sub">{sub}</div>}
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

function Placeholder({ title, text }) {
  return (
    <div className="card center placeholder">
      <h3>{title}</h3>
      <p className="muted">{text}</p>
    </div>
  )
}

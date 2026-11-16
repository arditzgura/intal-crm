import { Link } from 'react-router-dom'
import { Factory, Box, Users, Warehouse, FileText, Handshake, ChartNoAxesCombined, Megaphone, Settings } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'

// Qendra e biznesit: vetëm lidhje drejt rubrikave ekzistuese (asnjë lexim nga Firestore).
// Çdo kartë hapet sipas lejeve të përdoruesit; pa leje shfaqet e kyçur.
const TILES = [
  { key: 'produktet', label: 'Produktet', desc: 'Artikuj, kategori, çmime', icon: Box, to: '/artikujt', perm: 'mod_artikujt' },
  { key: 'klientet', label: 'Klientët', desc: 'Klientë, kartela dhe borxhe', icon: Users, to: '/kliente', perm: 'mod_kliente' },
  {
    key: 'magazina',
    label: 'Magazina',
    desc: 'Hyrje, dalje, inventar',
    icon: Warehouse,
    pick: (p) => (p.has('mod_inventari') ? '/artikujt?skeda=gjendja' : p.has('mod_blerje') ? '/blerje' : null),
  },
  {
    key: 'faturat',
    label: 'Faturat',
    desc: 'Faturim dhe histori',
    icon: FileText,
    pick: (p) => (p.has('mod_historiku') ? '/historiku' : p.has('mod_fature_e_re') ? '/fature-e-re' : null),
  },
  {
    key: 'furnitoret',
    label: 'Furnitorët',
    desc: 'Furnitorë, fletëhyrje, detyrime',
    icon: Handshake,
    pick: (p) => (p.has('mod_kliente') ? '/kliente?tipi=furnitor' : p.has('mod_blerje') ? '/blerje' : null),
  },
  { key: 'raportet', label: 'Raportet', desc: 'Shitje dhe analiza', icon: ChartNoAxesCombined, to: '/raporte', perm: 'mod_raporte' },
  { key: 'marketingu', label: 'Marketingu', desc: 'Instagram dhe katalogë', icon: Megaphone, soon: true },
  { key: 'administrimi', label: 'Administrimi', desc: 'Përdorues, cilësime, importi', icon: Settings, to: '/cilesimet', perm: 'admin' },
]

function targetFor(tile, perms) {
  if (tile.soon) return null
  if (tile.pick) return tile.pick(perms)
  return perms.has(tile.perm) ? tile.to : null
}

export default function HubPage() {
  const { perms } = useAuth()
  const { settings } = useSettings()
  const emri = settings?.kompania?.emri || 'INTAL'

  return (
    <div className="hub">
      <div className="hub-head">
        <Factory size={26} strokeWidth={1.8} className="hub-head-icon" />
        <div>
          <h1 className="hub-title">{emri.toUpperCase()} BUSINESS HUB</h1>
          <div className="hub-sub">Qendra juaj e menaxhimit të biznesit</div>
        </div>
      </div>

      <div className="hub-grid">
        {TILES.map((t) => {
          const to = targetFor(t, perms)
          const I = t.icon
          const body = (
            <>
              <I size={22} strokeWidth={1.8} className="hub-icon" />
              <div className="hub-label">
                {t.label}
                {t.soon && <span className="hub-badge">Së shpejti</span>}
                {!t.soon && !to && <span className="hub-badge">Pa akses</span>}
              </div>
              <div className="hub-desc">{t.desc}</div>
            </>
          )
          return to ? (
            <Link key={t.key} to={to} className="hub-tile">{body}</Link>
          ) : (
            <div key={t.key} className="hub-tile disabled" aria-disabled="true">{body}</div>
          )
        })}
      </div>
    </div>
  )
}

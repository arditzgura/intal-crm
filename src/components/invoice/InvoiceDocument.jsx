import { forwardRef } from 'react'
import { formatMoney } from '../../utils/money'
import { formatDate } from '../../utils/date'

/**
 * Pamja e printueshme e faturës. format: 'a4' | 'termik'.
 * Shablloni, fontet, watermark-u dhe etiketat vijnë nga Cilësimet.
 * Shumat janë "fotografia" e lëshimit (nuk ndryshojnë më pas).
 */
const InvoiceDocument = forwardRef(function InvoiceDocument({ invoice, settings, format = 'a4' }, ref) {
  const k = settings.kompania
  const f = settings.fatura
  const L = settings.etiketat
  const cur = invoice.monedha
  const m = (v) => formatMoney(v ?? 0)
  const isDraft = invoice.statusi === 'draft'
  const cancelled = invoice.statusi === 'anuluar'
  const gjendjaRe = invoice.gjendjaRe ?? 0
  const numri = invoice.numriTekst ?? (isDraft ? 'DRAFT' : invoice.numri)
  const itemStyle = { fontFamily: f.fonti, fontSize: `${f.madhesiaFontit}px` }
  const k1 = invoice.klient ?? {}

  if (format === 'termik') {
    return (
      <div ref={ref} className="inv inv-thermal" style={{ width: `${f.gjeresiaTermike}mm` }}>
        {k.logo && <img src={k.logo} alt="" className="inv-th-logo" />}
        <div className="inv-th-center">
          <b className="inv-th-company">{k.emri}</b>
          {k.nipt && <div>NIPT: {k.nipt}</div>}
          {k.adresa && <div>{k.adresa}</div>}
          {k.telefoni && <div>Tel: {k.telefoni}</div>}
        </div>
        <div className="inv-th-sep" />
        <div className="inv-th-center">
          <b>{L.fatura} Nr. {numri}</b>
          <div>{formatDate(invoice.data)}</div>
          {cancelled && <b>*** ANULUAR ***</b>}
        </div>
        <div className="inv-th-sep" />
        <div>{L.klienti}: <b>{k1.emri}</b></div>
        {k1.qyteti && <div>{k1.qyteti}</div>}
        <div className="inv-th-sep" />
        <table className="inv-th-items" style={itemStyle}>
          <tbody>
            {invoice.rreshtat.map((r, i) => (
              <tr key={i}>
                <td>
                  <div>{r.emri}</div>
                  <div className="inv-th-sub">{r.sasia} {r.njesia} × {m(r.cmimi)}</div>
                </td>
                <td className="num">{m(r.totali)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inv-th-sep" />
        <ThermalRow label={L.totali} value={`${m(invoice.totali)} ${cur}`} bold />
        {!isDraft && (
          <>
            <ThermalRow label={L.gjendja} value={m(invoice.gjendjaPara)} />
            <ThermalRow label={L.paguar} value={m(invoice.paguar)} />
            <ThermalRow label={gjendjaRe < 0 ? L.teprica : L.detyrimi} value={`${m(Math.abs(gjendjaRe))} ${cur}`} bold />
          </>
        )}
        {invoice.shenime && (
          <>
            <div className="inv-th-sep" />
            <div className="inv-notes">{invoice.shenime}</div>
          </>
        )}
        <div className="inv-th-sep" />
        <div className="inv-th-center">{L.falenderim}</div>
        {k.slogani && <div className="inv-th-center inv-th-sub">{k.slogani}</div>}
      </div>
    )
  }

  return (
    <div ref={ref} className={`inv inv-a4 tpl-${f.shablloni}`}>
      {k.logo && f.watermarkMadhesia > 0 && (
        <img
          src={k.logo}
          alt=""
          className="inv-watermark"
          style={{ width: `${f.watermarkMadhesia}%`, opacity: f.watermarkTransparenca / 100 }}
        />
      )}
      {cancelled && <div className="inv-stamp">ANULUAR</div>}
      {isDraft && <div className="inv-stamp draft">DRAFT</div>}

      <header className="inv-head">
        <div className="inv-company">
          {k.logo && <img src={k.logo} alt="" className="inv-logo" />}
          <div>
            <div className="inv-company-name">{k.emri}</div>
            {k.slogani && <div className="inv-slogan">{k.slogani}</div>}
            <div className="inv-company-lines">
              {k.nipt && <span>NIPT: {k.nipt}</span>}
              {k.adresa && <span>{k.adresa}</span>}
              {k.telefoni && <span>Tel: {k.telefoni}</span>}
              {k.email && <span>{k.email}</span>}
              {k.website && <span>{k.website}</span>}
            </div>
          </div>
        </div>
        <div className="inv-title">
          <div className="inv-title-label">{L.fatura}</div>
          <div className="inv-title-num">Nr. {numri}</div>
          <div>Data: {formatDate(invoice.data)}</div>
          <div>Monedha: {cur}</div>
        </div>
      </header>

      <section className="inv-client">
        <div className="inv-client-label">{L.klienti}</div>
        <div className="inv-client-name">{k1.emri}</div>
        <div className="inv-client-lines">
          {k1.kodi && <span>Kodi: {k1.kodi}</span>}
          {k1.nipt && <span>NIPT: {k1.nipt}</span>}
          {k1.adresa && <span>{k1.adresa}</span>}
          {k1.qyteti && <span>{k1.qyteti}</span>}
          {k1.telefoni && <span>Tel: {k1.telefoni}</span>}
        </div>
      </section>

      <table className="inv-items" style={itemStyle}>
        <thead>
          <tr>
            <th className="c-nr">Nr.</th>
            <th>{L.artikulli}</th>
            <th className="c-unit">Njësia</th>
            <th className="num">{L.sasia}</th>
            <th className="num">{L.cmimi}</th>
            <th className="num">Vlera</th>
          </tr>
        </thead>
        <tbody>
          {invoice.rreshtat.map((r, i) => (
            <tr key={i}>
              <td className="c-nr">{i + 1}</td>
              <td>
                {r.emri}
                {r.kodi && <span className="inv-code"> ({r.kodi})</span>}
              </td>
              <td className="c-unit">{r.njesia}</td>
              <td className="num">{r.sasia}</td>
              <td className="num">
                {r.cmimiOrigjinal != null && <s className="inv-orig">{m(r.cmimiOrigjinal)}</s>} {m(r.cmimi)}
              </td>
              <td className="num">{m(r.totali)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-bottom">
        <div className="inv-left">
          {invoice.shenime && (
            <div className="inv-notes">
              <b>Shënime:</b> {invoice.shenime}
            </div>
          )}
          {(k.banka || k.iban) && (
            <div className="inv-bank">
              {k.banka && <div>Banka: {k.banka}</div>}
              {k.iban && <div>IBAN: {k.iban}</div>}
            </div>
          )}
        </div>
        <table className="inv-totals">
          <tbody>
            <tr><td>{L.nentotali}</td><td className="num">{m(invoice.nentotali ?? invoice.totali)}</td></tr>
            <tr className="strong"><td>{L.totali}</td><td className="num">{m(invoice.totali)} {cur}</td></tr>
            {!isDraft && (
              <>
                <tr><td>{L.gjendja}</td><td className="num">{m(invoice.gjendjaPara)}</td></tr>
                <tr><td>{L.paguar}</td><td className="num">{m(invoice.paguar)}</td></tr>
                <tr className="strong big">
                  <td>{gjendjaRe < 0 ? L.teprica : L.detyrimi}</td>
                  <td className="num">{m(Math.abs(gjendjaRe))} {cur}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <footer className="inv-foot">
        <div className="inv-sign">
          <div>Dorëzoi</div>
          <div>Pranoi</div>
        </div>
        <div className="inv-thanks">{L.falenderim}</div>
      </footer>
    </div>
  )
})

function ThermalRow({ label, value, bold }) {
  return (
    <div className={`inv-th-row ${bold ? 'bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default InvoiceDocument

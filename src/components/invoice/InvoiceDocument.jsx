import { forwardRef } from 'react'
import { formatMoney } from '../../utils/money'
import { formatDate, toDate } from '../../utils/date'

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

  if (format === 'a4' && (f.shablloni ?? 'klasik') === 'klasik') {
    return <IntalA4 ref={ref} invoice={invoice} settings={settings} />
  }

  if (format === 'termik') {
    const sym = cur === 'LEK' ? 'L' : cur === 'EUR' ? '€' : '$'
    const paid = invoice.statusi === 'e_paguar'
    const city = k1.qyteti ? ` (${k1.qyteti})` : ''
    return (
      <div ref={ref} className="inv inv-thermal th2" style={{ width: `${f.gjeresiaTermike}mm` }}>
        <div className="th2-head">
          <div className="th2-company">{k.emri}</div>
          {k.adresa && <div>{k.adresa}</div>}
          {k.telefoni && <div>Tel: {k.telefoni}</div>}
          {k.website && <div className="th2-web">{k.website}</div>}
          {k.nipt && <div>NIPT: {k.nipt}</div>}
        </div>
        <div className="th2-rule" />
        <div className="th2-row"><span>{L.fatura.toUpperCase()} NR:</span><b>#{numri}</b></div>
        <div className="th2-row"><span>DATA:</span><span>{formatDate(invoice.data).replaceAll('.', '/')}</span></div>
        {cancelled && <div className="th2-cancel">*** ANULUAR ***</div>}

        <div className="th2-boxes">
          <div className="th2-box th2-client">
            <small>{L.klienti.toUpperCase()}</small>
            <b>{k1.emri}{city}</b>
          </div>
          {invoice.piketKlientit != null && (
            <div className="th2-box th2-points">
              <small>PIKËT</small>
              <b>{invoice.piketKlientit}</b>
            </div>
          )}
        </div>

        <div className="th2-items" style={itemStyle}>
          {invoice.rreshtat.map((r, i) => (
            <div key={i} className="th2-item">
              <b className="th2-item-name">{r.emri}</b>
              <div className="th2-row"><span>{r.sasia} × {m(r.cmimi)}</span><b>{m(r.totali)} {sym}</b></div>
            </div>
          ))}
        </div>

        <div className="th2-row th2-sub"><span>{L.nentotali.toUpperCase()}:</span><span>{m(invoice.nentotali ?? invoice.totali)} {sym}</span></div>
        <div className="th2-total"><span>{L.totali.toUpperCase()}:</span><b>{m(invoice.totali)} {sym}</b></div>

        {!isDraft && !cancelled && (
          <div className={`th2-status ${paid ? 'paid' : ''}`}>STATUSI: {paid ? '✓ PAGUAR' : '× PA PAGUAR'}</div>
        )}

        {invoice.shenime && (
          <div className="th2-notes"><b>SHËNIME:</b> <i>{invoice.shenime}</i></div>
        )}
        <div className="th2-thanks">{(L.falenderim || 'Faleminderit! Ju mirëpresim përsëri!').toUpperCase()}</div>
      </div>
    )
  }

  return (
    <div ref={ref} className={`inv inv-a4 tpl-${f.shablloni}`}>
      <Watermark f={f} />
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
          {k1.adresa && k1.adresa.trim().toUpperCase() !== (k1.qyteti ?? '').trim().toUpperCase() && <span>{k1.adresa}</span>}
          {k1.qyteti && <span>{k1.qyteti}</span>}
          {phoneOf(k1) && <span>Tel: {phoneOf(k1)}</span>}
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

/** Watermark-u: imazh më vete nga Cilësimet (logoja përdoret vetëm në krye). */
function Watermark({ f }) {
  if (!f.watermark || !(f.watermarkMadhesia > 0)) return null
  return <img src={f.watermark} alt="" className="inv-watermark" style={{ width: `${f.watermarkMadhesia}%`, opacity: (f.watermarkTransparenca ?? 10) / 100 }} />
}

/** Telefoni i klientit vetëm kur është numër (në të dhënat e vjetra disa kanë qytetin aty). */
const phoneOf = (k1) => (k1.telefoni && /\d/.test(k1.telefoni) ? k1.telefoni : '')

/** Shablloni kryesor (si fatura e sistemit të vjetër INTAL). */
const IntalA4 = forwardRef(function IntalA4({ invoice, settings }, ref) {
  const k = settings.kompania
  const f = settings.fatura
  const L = settings.etiketat
  const cur = invoice.monedha
  const sym = cur === 'LEK' ? 'L' : cur === 'EUR' ? '€' : '$'
  const word = cur === 'LEK' ? 'LEKË' : cur
  const m = (v) => formatMoney(v ?? 0)
  const isDraft = invoice.statusi === 'draft'
  const cancelled = invoice.statusi === 'anuluar'
  const gjendjaRe = invoice.gjendjaRe ?? invoice.totali ?? 0
  const numri = invoice.numriTekst ?? (isDraft ? 'DRAFT' : invoice.numri)
  const k1 = invoice.klient ?? {}
  const time = toDate(invoice.leshuar ?? invoice.krijuar)
  const itemStyle = { fontFamily: f.fonti, fontSize: `${f.madhesiaFontit}px` }
  const debtLabel = gjendjaRe < 0 ? L.teprica : L.detyrimi

  return (
    <div ref={ref} className="inv inv-a4 tpl-intal">
      <Watermark f={f} />
      {cancelled && <div className="inv-stamp">ANULUAR</div>}
      {isDraft && <div className="inv-stamp draft">DRAFT</div>}

      <header className="ti-head">
        <div className="ti-company">
          {k.logo ? <img src={k.logo} alt="" className="ti-logo" /> : <div className="ti-name">{k.emri}</div>}
          {k.slogani && <div className="ti-slogan">{k.slogani}</div>}
          <div className="ti-lines">
            {k.adresa && <div>{k.adresa}</div>}
            {k.telefoni && <div>Tel: {k.telefoni}</div>}
            {k.website && <div>{k.website}</div>}
            {k.nipt && <div>NIPT: {k.nipt}</div>}
          </div>
        </div>
        <div className="ti-right">
          <div className="ti-title">{L.fatura}</div>
          <div className="ti-meta">
            <b>NR. {numri}</b>
            <span>DATA: {formatDate(invoice.data)}</span>
            {time && <span>ORA: {String(time.getHours()).padStart(2, '0')}:{String(time.getMinutes()).padStart(2, '0')}</span>}
          </div>
        </div>
      </header>

      <section className="ti-client-row">
        <div className="ti-client">
          <div className="ti-client-label">{L.klienti}:</div>
          <div className="ti-client-name">{k1.emri}</div>
          {k1.qyteti && <div className="ti-client-city">{k1.qyteti}</div>}
          {phoneOf(k1) && <div className="ti-client-city">{phoneOf(k1)}</div>}
        </div>
        {!isDraft && (
          <div className="ti-pills">
            <div className={`ti-debt ${gjendjaRe < 0 ? 'credit' : ''}`}>
              <span>{debtLabel}</span>
              <b>{m(Math.abs(gjendjaRe))} {word}</b>
            </div>
            {invoice.piketKlientit != null && (
              <div className="ti-points">★ PIKËT: <b>{invoice.piketKlientit}</b></div>
            )}
          </div>
        )}
      </section>

      <table className="ti-items" style={itemStyle}>
        <thead>
          <tr>
            <th>{L.artikulli}</th>
            <th className="c">{L.sasia}</th>
            <th className="c">{L.cmimi}</th>
            <th className="r">{L.totali}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.rreshtat.map((r, i) => (
            <tr key={i}>
              <td className="ti-item-name">{r.emri}</td>
              <td className="c">{r.sasia}</td>
              <td className="c ti-price">{r.cmimiOrigjinal != null && <s>{m(r.cmimiOrigjinal)}</s>} {m(r.cmimi)} {sym}</td>
              <td className="r"><b>{m(r.totali)} {sym}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ti-bottom">
        <div className="ti-left">
          {invoice.shenime && (
            <div className="ti-notes">
              <div className="ti-notes-label">Shënime:</div>
              <div className="ti-notes-text">{invoice.shenime}</div>
            </div>
          )}
          {k.instagram && (
            <div className="ti-insta">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
              {k.instagram.startsWith('@') ? k.instagram : `@${k.instagram}`}
            </div>
          )}
          {(k.banka || k.iban) && <div className="ti-bank">{[k.banka, k.iban && `IBAN: ${k.iban}`].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="ti-totals">
          <div className="ti-row"><span>{L.nentotali}:</span><b>{m(invoice.nentotali ?? invoice.totali)} {sym}</b></div>
          {!isDraft && invoice.gjendjaPara !== 0 && invoice.gjendjaPara != null && (
            <div className="ti-row"><span>{L.gjendja} (+):</span><b>{m(invoice.gjendjaPara)} {sym}</b></div>
          )}
          {!isDraft && invoice.paguar > 0 && (
            <div className="ti-row"><span>{L.paguar} (−):</span><b>{m(invoice.paguar)} {sym}</b></div>
          )}
          {!isDraft && (
            <div className={`ti-row ti-final ${gjendjaRe < 0 ? 'credit' : ''}`}>
              <span>{debtLabel}:</span><b>{m(Math.abs(gjendjaRe))} {word}</b>
            </div>
          )}
        </div>
      </div>

      <footer className="ti-foot">
        <div className="ti-thanks">{L.falenderim}</div>
        {L.besnikeria && <div className="ti-loyalty">{L.besnikeria}</div>}
      </footer>
    </div>
  )
})

export default InvoiceDocument

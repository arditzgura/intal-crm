import { useMemo, useState } from 'react'
import { Upload, Play, Download, Lock, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import {
  readBackupFile, buildImportPlan, planHash, runImport, watchImportMeta, readImportProgress, setImportMode, QuotaError, projectId,
} from '../../services/importService'
import { STATUS_LABELS } from '../../services/invoiceChain'
import { errorMessage } from '../../services/authService'
import { formatMoney, formatRate, parseRate } from '../../utils/money'
import { formatDate } from '../../utils/date'
import { downloadCsv } from '../../utils/csv'

/**
 * Importi i backup-it të sistemit të vjetër (vetëm Admin):
 * 1) ngarko .json  2) parapamje + problemet + zgjedhjet  3) importo me batch-e
 * (mund të vazhdohet pas ndërprerjes / kuotës ditore)  4) raporti  5) mbyll mënyrën e importit.
 */
export default function ImportTab() {
  const { user, profile } = useAuth()
  const { settings } = useSettings()
  const { data: meta } = useLive(watchImportMeta, [], { initial: null })
  const [file, setFile] = useState(null)
  const [backup, setBackup] = useState(null)
  const [eurText, setEurText] = useState(formatRate(settings.monedhat.EUR))
  const [overrides, setOverrides] = useState({})
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [msg, setMsg] = useState(null)

  const eurRate = parseRate(eurText)
  const choices = useMemo(() => ({ eurRate, overrides }), [eurRate, overrides])
  const plan = useMemo(() => {
    if (!backup || !eurRate) return null
    try {
      return buildImportPlan(backup, choices, { uid: user.uid, emri: profile?.emri })
    } catch (err) {
      return { error: err.message }
    }
  }, [backup, choices, user.uid, profile?.emri, eurRate])
  const hash = backup && eurRate ? planHash(backup, choices) : null
  // Kur serveri s'ka pranuar ende paketën e fundit (pending), importi s'ka mbaruar realisht.
  const canResume = meta && meta.done > 0 && (!meta.perfunduar || meta.pending) && meta.planHash === hash
  const otherInProgress = meta && meta.done > 0 && !meta.perfunduar && hash && meta.planHash !== hash

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    setMsg(null)
    try {
      const data = await readBackupFile(f)
      setFile(f)
      setBackup(data)
      // Rifut zgjedhjet e ruajtura nëse po vazhdohet i njëjti import
      if (meta?.choices && !meta.perfunduar) {
        setEurText(formatRate(meta.choices.eurRate))
        setOverrides(meta.choices.overrides ?? {})
      } else {
        setOverrides({})
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function start(resume) {
    if (!plan || plan.error) return
    let startAt = 0
    if (resume) {
      // Vazhdo nga progresi i konfirmuar nga serveri.
      const server = await readImportProgress().catch(() => null)
      if (server?.perfunduar) {
        setMsg({ type: 'success', text: 'Importi është përfunduar tashmë sipas serverit.' })
        return
      }
      startAt = server?.done ?? meta.done
    }
    const text = resume
      ? `Të vazhdojë importi nga shkrimi ${startAt} nga ${plan.ops.length}?`
      : `Të fillojë importi në projektin "${projectId}"?\n\n${plan.summary.faturat} fatura, ${plan.summary.klientet} klientë, ${plan.summary.artikujt} artikuj, ${plan.summary.hyrjet} hyrje.\n${plan.ops.length} shkrime gjithsej (kuota falas: 20 000 në ditë; importi vazhdon nesër nëse ndalon).\n\nDokumentet ekzistuese me të njëjtat ID mbishkruhen.`
    if (!window.confirm(text)) return
    setRunning(true)
    setMsg(null)
    setProgress({ done: startAt, total: plan.ops.length })
    try {
      await setImportMode(true, { choices, fileName: file?.name ?? '' })
      await runImport(plan.ops, { hash, startAt, onProgress: (done, total) => setProgress({ done, total }) })
      setMsg({ type: 'success', text: 'Importi përfundoi. Kontrolloni raportin më poshtë, pastaj mbyllni mënyrën e importit.' })
    } catch (err) {
      if (err instanceof QuotaError) setMsg({ type: 'error', text: `${err.message} Nesër ngarkoni të njëjtin skedar dhe shtypni "Vazhdo importin".` })
      else setMsg({ type: 'error', text: `Importi u ndal: ${err.code ? errorMessage(err) : err.message}. Mund ta vazhdoni më vonë nga i njëjti vend.` })
    } finally {
      setRunning(false)
    }
  }

  async function closeMode() {
    if (!window.confirm('Të mbyllet mënyra e importit? Pas kësaj vlejnë vetëm rregullat normale.')) return
    try {
      await setImportMode(false)
      setMsg({ type: 'success', text: 'Mënyra e importit u mbyll.' })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    }
  }

  function downloadReport() {
    const R = plan.report
    const rows = [
      ...R.renumbered.map((r) => ['Rinumërim', r.vjeter, r.ri, formatDate(r.data), '']),
      ...R.statusDiffs.map((d) => ['Status ndryshe', d.fatura, d.klienti, STATUS_LABELS[d.vjeter], `${STATUS_LABELS[d.llogaritur]} → zgjedhur: ${overrides[d.id] === 'vjeter' ? 'i vjetri' : 'i llogaritur'}`]),
      ...R.initialBalances.map((b) => ['Gjendje fillestare', b.fatura, b.klienti, formatMoney(b.shuma, b.monedha), '']),
      ...R.manualAdjustments.map((m) => ['Rregullim manual', m.fatura, m.klienti, `${formatMoney(m.llogaritur)} → ${formatMoney(m.vendosur)}`, `${formatMoney(m.diferenca)} ${m.monedha} (${m.lloji})`]),
      ...R.missingClients.map((c) => ['Klient që mungonte (arkivuar)', c.id, c.emri, '', '']),
      ...R.missingItems.map((c) => ['Artikull që mungonte (arkivuar)', c.id, c.emri, '', '']),
      ...R.labels.map((l) => ['Etiketë jo-standarde', l.fatura, l.fusha, l.etiketa, '']),
      ...R.skippedPayments.map((p) => ['Pagesë e kapërcyer', p.fatura, formatMoney(p.shuma), p.arsye, '']),
      ...R.badDates.map((d) => ['Datë e gabuar (u përdor data e faturës)', d.fatura, d.fusha, d.vlera, '']),
      ...R.lineMismatches.map((m) => ['Rreshtat ≠ totali', m.fatura, formatMoney(m.rreshtat), formatMoney(m.totali), '']),
      ...R.negativeStock.map((n) => ['Stok negativ', n.kodi, n.emri, n.sasia, '']),
    ]
    downloadCsv(`raporti_importit_${new Date().toISOString().slice(0, 10)}.csv`, ['Lloji', 'Fatura / kodi', 'Detaj 1', 'Detaj 2', 'Detaj 3'], rows)
  }

  const R = plan && !plan.error ? plan.report : null
  const pct = progress ? Math.round((progress.done * 100) / progress.total) : 0

  return (
    <>
      <div className="card">
        <h3>Importi i të dhënave të vjetra</h3>
        <div className="alert">
          Projekti Firebase aktual: <b>{projectId}</b>. Importi shkruan në këtë databazë. Testojeni fillimisht në projektin e provës.
        </div>
        {meta?.aktiv && (
          <div className="alert error">
            <Lock size={14} /> Mënyra e importit është e <b>hapur</b>
            {meta.total ? ` (${meta.done ?? 0} / ${meta.total} shkrime${meta.perfunduar ? ', përfunduar' : ''})` : ''}.{' '}
            <button className="btn small" onClick={closeMode} disabled={running}>Mbyll mënyrën e importit</button>
          </div>
        )}
        <label className="btn">
          <Upload size={16} /> Zgjidh skedarin e backup-it (.json)
          <input type="file" accept="application/json,.json" hidden onChange={onFile} />
        </label>
        {file && <span className="muted small"> {file.name} · eksportuar më {formatDate(backup?.exportedAt)}</span>}
        {error && <div className="alert error">{error}</div>}
      </div>

      {plan?.error && <div className="alert error">{plan.error}</div>}

      {R && (
        <>
          <div className="balance-cards inv-cards">
            <Stat label="Fatura" value={plan.summary.faturat} sub={`${plan.summary.rreshtat} rreshta`} />
            <Stat label="Klientë" value={plan.summary.klientet} />
            <Stat label="Artikuj" value={plan.summary.artikujt} />
            <Stat label="Hyrje malli" value={plan.summary.hyrjet} />
            <Stat label="Arkëtime (arkë)" value={formatMoney(plan.summary.arketimet.LEK, 'LEK')} sub={plan.summary.arketimet.EUR ? formatMoney(plan.summary.arketimet.EUR, 'EUR') : ''} />
            <Stat label="Shkrime" value={plan.ops.length.toLocaleString('sq')} sub={`≈ ${Math.ceil(plan.ops.length / 20000)} ditë me kuotën falas`} />
          </div>

          <div className="card">
            <h3>Zgjedhjet</h3>
            <div className="grid-2">
              <label className="field">
                <span>Kursi EUR → LEK për faturat e vjetra në EUR</span>
                <input inputMode="decimal" value={eurText} onChange={(e) => setEurText(e.target.value)} disabled={running} />
              </label>
              <div className="field">
                <span>Numërimi</span>
                <div className="example">Numri më i madh {plan.summary.maxNumber} · faturat e reja nga <b>{plan.summary.nextInvoice}</b></div>
              </div>
            </div>
          </div>

          <Section title={`Faturat me status ndryshe (${R.statusDiffs.length})`} hint="Statusi rillogaritet me rregullin e bartjes. Zgjidhni për secilën.">
            <table className="table">
              <thead><tr><th>Fatura</th><th>Klienti</th><th>I vjetri</th><th>I llogaritur</th><th>Përdor</th></tr></thead>
              <tbody>
                {R.statusDiffs.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.fatura}</td>
                    <td>{d.klienti}</td>
                    <td><span className={`status st-${d.vjeter}`}>{STATUS_LABELS[d.vjeter]}</span></td>
                    <td><span className={`status st-${d.llogaritur}`}>{STATUS_LABELS[d.llogaritur]}</span></td>
                    <td>
                      <select value={overrides[d.id] ?? 'llogaritur'} disabled={running} onChange={(e) => setOverrides((o) => ({ ...o, [d.id]: e.target.value }))}>
                        <option value="llogaritur">I llogaritur</option>
                        <option value="vjeter">I vjetri</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title={`Numra të dyfishtë: ${R.duplicateGroups} grupe, ${R.renumbered.length} fatura rinumërohen`} hint="Më e vjetra e mban numrin; të tjerat marrin numra të rinj sipas rendit kronologjik. Numri i vjetër ruhet dhe gjendet me kërkim.">
            <table className="table">
              <thead><tr><th>Nr. i vjetër</th><th>Nr. i ri</th><th>Data (nga id)</th></tr></thead>
              <tbody>{R.renumbered.map((r) => <tr key={r.id}><td>{r.vjeter}</td><td><b>{r.ri}</b></td><td>{formatDate(r.data)}</td></tr>)}</tbody>
            </table>
          </Section>

          <Section title={`Gjendje fillestare (${R.initialBalances.length}) dhe rregullime manuale (${R.manualAdjustments.length})`} hint="Gjendja e shkruar me dorë në sistemin e vjetër ruhet si lëvizje në kartelë, që gjendjet të përputhen me faturat e printuara.">
            <table className="table">
              <thead><tr><th>Fatura</th><th>Klienti</th><th>Lloji</th><th className="num">Llogaritur</th><th className="num">Vendosur</th><th className="num">Diferenca</th></tr></thead>
              <tbody>
                {R.initialBalances.map((b, i) => <tr key={`i${i}`}><td>{b.fatura}</td><td>{b.klienti}</td><td>Gjendje fillestare</td><td className="num">0</td><td className="num">{formatMoney(b.shuma)}</td><td className="num">{formatMoney(b.shuma, b.monedha)}</td></tr>)}
                {R.manualAdjustments.map((m, i) => <tr key={`m${i}`}><td>{m.fatura}</td><td>{m.klienti}</td><td>{m.lloji}</td><td className="num">{formatMoney(m.llogaritur)}</td><td className="num">{formatMoney(m.vendosur)}</td><td className="num">{formatMoney(m.diferenca, m.monedha)}</td></tr>)}
              </tbody>
            </table>
          </Section>

          <Section title="Probleme të tjera" open>
            <ul className="problem-list">
              <li>Klientë që mungonin (krijohen "arkivuar"): <b>{R.missingClients.length}</b> {R.missingClients.map((c) => c.emri).join(', ')}</li>
              <li>Artikuj që mungonin (krijohen "arkivuar"): <b>{R.missingItems.length}</b> {R.missingItems.map((c) => c.emri).join(', ')}</li>
              <li>Etiketa jo-standarde (Posta / DISCOUNT / Kthim): <b>{R.labels.length}</b></li>
              <li>Pagesa të kapërcyera (të njëjta me "Paguar"): <b>{R.skippedPayments.length}</b></li>
              <li>Data të gabuara (u përdor data e faturës): <b>{R.badDates.length}</b> {R.badDates.map((d) => `#${d.fatura}: ${d.vlera}`).join(', ')}</li>
              <li>Çmime preferenciale për klientë që nuk ekzistojnë (kapërcehen): <b>{R.skippedPrefs}</b></li>
              <li>Fatura ku rreshtat ≠ totali: <b>{R.lineMismatches.length}</b></li>
              <li>Origjinat e hyrjeve (shtohen te Cilësimet): {R.origins.join(', ')}</li>
              <li className={R.balanceErrors.length ? 'neg' : 'pos'}>Kontrolli i gjendjeve: {R.balanceChecks - R.balanceErrors.length} / {R.balanceChecks} klientë përputhen me faturën e fundit</li>
            </ul>
          </Section>

          <Section title={`Artikuj me stok negativ pas importit (${R.negativeStock.length})`} hint="Stoku = Σ hyrje − Σ sasi të faturuara. Pas importit bëni inventarizim te Inventari.">
            <table className="table">
              <tbody>{R.negativeStock.map((n) => <tr key={n.id}><td className="mono">{n.kodi}</td><td>{n.emri}</td><td className="num neg">{n.sasia}</td></tr>)}</tbody>
            </table>
          </Section>

          <div className="card">
            {otherInProgress && (
              <div className="alert error"><AlertTriangle size={14} /> Ka një import të papërfunduar me skedar ose zgjedhje të tjera ({meta.done}/{meta.total}). Fillimi i ri e rifillon nga zero.</div>
            )}
            {progress && (
              <div className="progress-wrap">
                <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
                <div className="small muted">{progress.done.toLocaleString('sq')} / {progress.total.toLocaleString('sq')} shkrime ({pct}%)</div>
              </div>
            )}
            {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
            <div className="inv-actions">
              <button className="btn" onClick={downloadReport}><Download size={16} /> Shkarko raportin (CSV)</button>
              {canResume ? (
                <button className="btn primary big-btn" onClick={() => start(true)} disabled={running}><Play size={16} /> Vazhdo importin ({meta.done}/{meta.total})</button>
              ) : (
                <button className="btn primary big-btn" onClick={() => start(false)} disabled={running}><Play size={16} /> {running ? 'Duke importuar…' : 'Fillo importin'}</button>
              )}
            </div>
          </div>
        </>
      )}
    </>
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

function Section({ title, hint, children, open }) {
  return (
    <details className="card import-section" open={open}>
      <summary><b>{title}</b></summary>
      {hint && <p className="muted small">{hint}</p>}
      <div className="table-wrap">{children}</div>
    </details>
  )
}

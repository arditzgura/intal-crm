import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { logout, refreshVerification, resendVerification, errorMessage } from '../services/authService'

/** Admini i një kompanie të re duhet të verifikojë email-in para se ta përdorë aplikacionin. */
export default function VerifyEmailPage() {
  const { user, reload } = useAuth()
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onCheck() {
    setBusy(true)
    setMsg(null)
    try {
      if (await refreshVerification()) reload()
      else setMsg({ type: 'error', text: 'Email-i ende nuk është verifikuar. Hapni lidhjen te email-i dhe provoni përsëri.' })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function onResend() {
    setMsg(null)
    try {
      await resendVerification()
      setMsg({ type: 'success', text: `Email-i u ridërgua te ${user?.email}.` })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    }
  }

  return (
    <div className="center-screen login-bg">
      <div>
        <div className="card narrow verify-card">
          <MailCheck size={44} className="verify-icon" />
          <h2>Verifikoni email-in</h2>
          <p>Ju dërguam një email te <b>{user?.email}</b>. Hapni lidhjen brenda tij (shikoni edhe te Spam), pastaj klikoni më poshtë.</p>
          {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
          <button type="button" className="btn primary block" onClick={onCheck} disabled={busy}>{busy ? 'Duke kontrolluar…' : 'E verifikova'}</button>
          <button type="button" className="btn link block" onClick={onResend}>Ridërgo email-in</button>
          <button type="button" className="btn link block" onClick={logout}>Dil</button>
        </div>
      </div>
    </div>
  )
}

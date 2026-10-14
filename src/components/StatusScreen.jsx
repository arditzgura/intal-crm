import { logout } from '../services/authService'

export default function StatusScreen({ title, message, loading, showLogout }) {
  return (
    <div className="center-screen">
      <div className="card narrow center">
        {loading && <div className="spinner" />}
        <h2>{title}</h2>
        {message && <p className="muted">{message}</p>}
        {showLogout && (
          <button className="btn" onClick={logout}>
            Dil
          </button>
        )}
      </div>
    </div>
  )
}

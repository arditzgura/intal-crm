import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { configMissing } from './firebase'
import { AuthProvider } from './hooks/useAuth'
import './styles.css'

const root = createRoot(document.getElementById('root'))

if (configMissing) {
  root.render(
    <div className="center-screen">
      <div className="card narrow">
        <h1>Konfigurimi mungon</h1>
        <p>
          Variablat <code>VITE_FIREBASE_*</code> nuk janë vendosur. Krijoni skedarin <code>.env</code>{' '}
          (shih <code>.env.example</code>) dhe rinisni aplikacionin.
        </p>
      </div>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    </StrictMode>,
  )
}

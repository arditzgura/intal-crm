import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { SettingsProvider } from './hooks/useSettings'
import { MODULES, homePathFor } from './config/roles'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import StatusScreen from './components/StatusScreen'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import ProfilePage from './pages/ProfilePage'
import PlaceholderPage from './pages/PlaceholderPage'
import SettingsPage from './pages/settings/SettingsPage'
import ClientsPage from './pages/clients/ClientsPage'
import ClientProfilePage from './pages/clients/ClientProfilePage'
import ItemsPage from './pages/items/ItemsPage'
import ItemProfilePage from './pages/items/ItemProfilePage'
import NewInvoicePage from './pages/invoices/NewInvoicePage'
import HistoryPage from './pages/invoices/HistoryPage'
import InvoiceViewPage from './pages/invoices/InvoiceViewPage'
import InventoryPage from './pages/inventory/InventoryPage'
import PurchasesPage from './pages/purchases/PurchasesPage'
import NewPurchasePage from './pages/purchases/NewPurchasePage'
import PurchaseViewPage from './pages/purchases/PurchaseViewPage'
import SalesPage from './pages/sales/SalesPage'
import FinancePage from './pages/finance/FinancePage'
import ReportsPage from './pages/reports/ReportsPage'
import { errorMessage } from './services/authService'

const PAGES = {
  cilesimet: SettingsPage,
  kliente: ClientsPage,
  artikujt: ItemsPage,
  'fature-e-re': NewInvoicePage,
  historiku: HistoryPage,
  inventari: InventoryPage,
  blerje: PurchasesPage,
  shitjet: SalesPage,
  financa: FinancePage,
  raporte: ReportsPage,
}

export default function App() {
  const { status, perms, error } = useAuth()

  if (status === 'loading') return <StatusScreen loading title="Duke u ngarkuar…" />
  if (status === 'signedOut') return <LoginPage />
  if (status === 'needsSetup') return <SetupPage />
  if (status === 'noAccess')
    return (
      <StatusScreen
        title="Pa akses"
        message="Llogaria juaj nuk është aktivizuar në INTAL PRO. Kërkojini Administratorit t'ju krijojë përdoruesin."
        showLogout
      />
    )
  if (status === 'inactive')
    return (
      <StatusScreen
        title="Llogari e çaktivizuar"
        message="Kjo llogari është çaktivizuar nga Administratori."
        showLogout
      />
    )
  if (status === 'error')
    return (
      <StatusScreen
        title="Profili nuk u lexua"
        message={
          error?.code === 'permission-denied'
            ? 'Firestore nuk e lejon leximin e profilit. Kontrolloni që Security Rules (firestore.rules) janë publikuar te Firebase Console → Firestore → Rules.'
            : errorMessage(error)
        }
        showLogout
      />
    )

  return (
    <SettingsProvider>
      <Routes>
        <Route element={<Layout />}>
          {MODULES.map((m) => {
            const Page = PAGES[m.key] ?? PlaceholderPage
            return (
              <Route
                key={m.key}
                path={`/${m.key}`}
                element={
                  <ProtectedRoute moduleKey={m.key}>
                    <Page module={m} />
                  </ProtectedRoute>
                }
              />
            )
          })}
          <Route
            path="/kliente/:id"
            element={
              <ProtectedRoute moduleKey="kliente">
                <ClientProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/artikujt/:id"
            element={
              <ProtectedRoute moduleKey="artikujt">
                <ItemProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fatura/:id"
            element={
              <ProtectedRoute moduleKey={['historiku', 'fature-e-re', 'kliente']}>
                <InvoiceViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/blerje/e-re"
            element={
              <ProtectedRoute moduleKey="blerje">
                <NewPurchasePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/blerje/:id"
            element={
              <ProtectedRoute moduleKey="blerje">
                <PurchaseViewPage />
              </ProtectedRoute>
            }
          />
          <Route path="/profili" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to={homePathFor(perms)} replace />} />
        </Route>
      </Routes>
    </SettingsProvider>
  )
}

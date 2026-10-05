import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider, DialogProvider } from './components/ui'
import { AuthProvider } from './lib/auth/AuthProvider'
import '@fontsource/atkinson-hyperlegible/latin-400.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import '@fontsource/atkinson-hyperlegible/latin-400-italic.css'
import '@fontsource/atkinson-hyperlegible/latin-700-italic.css'
import './index.css'
import { initTheme } from './lib/themeEngine'

initTheme()

// In-memory store never goes stale on its own — data changes only via mutations,
// which invalidate the relevant keys. Refetch-on-focus would be pure noise here.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary label="root">
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DialogProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  </ErrorBoundary>,
)
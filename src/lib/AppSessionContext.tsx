import { createContext, useContext, type ReactNode } from 'react'

export interface AppSessionValue {
  session: { user: { id: string; [key: string]: unknown }; [key: string]: unknown }
  activePersona: unknown
  personaId: string
  demoRole: string
  myWorkplace: unknown
  myWorkplaces: unknown[]
  activeWorkplaceId: string | null
  setActiveWorkplaceId: (id: string | null) => void
  refreshClients: () => void
  refreshMemberships: () => void
}

const AppSessionContext = createContext<AppSessionValue | null>(null)

export function AppSessionProvider({
  value,
  children,
}: {
  value: AppSessionValue
  children: ReactNode
}) {
  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  )
}

/** App shell session — persona, workplace context, and cache refreshers. */
export function useAppSession(): AppSessionValue {
  const ctx = useContext(AppSessionContext)
  if (!ctx) {
    throw new Error('useAppSession must be used within AppSessionProvider')
  }
  return ctx
}

import { createContext, useContext, type ReactNode } from 'react'

export interface AppPersona {
  id: string
  userId: string
  name: string
}

export interface AppSessionValue {
  session: { user: { id: string; [key: string]: unknown }; [key: string]: unknown }
  activePersona: AppPersona
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

/** Signed-in practice session and cache refreshers. */
export function useAppSession(): AppSessionValue {
  const ctx = useContext(AppSessionContext)
  if (!ctx) {
    throw new Error('useAppSession must be used within AppSessionProvider')
  }
  return ctx
}

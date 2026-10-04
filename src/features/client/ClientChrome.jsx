import { createContext, useContext, useMemo, useState } from 'react'

const ClientChromeContext = createContext(null)

export function ClientChromeProvider({ children }) {
  const [editorOpen, setEditorOpen] = useState(false)
  const value = useMemo(() => ({ editorOpen, setEditorOpen }), [editorOpen])
  return (
    <ClientChromeContext.Provider value={value}>
      {children}
    </ClientChromeContext.Provider>
  )
}

export function useClientChrome() {
  return useContext(ClientChromeContext)
}

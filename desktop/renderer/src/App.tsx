import { useState } from 'react'
import { Main } from './pages/Main'
import { Settings } from './pages/Settings'

type Page = 'main' | 'settings'

export function App() {
  const [page, setPage] = useState<Page>('main')

  if (page === 'settings') {
    return <Settings onBack={() => setPage('main')} />
  }

  return <Main onOpenSettings={() => setPage('settings')} />
}

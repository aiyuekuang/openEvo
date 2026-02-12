import { useEffect, useState } from 'react'
import { ClaudeSetup } from './pages/ClaudeSetup'
import { Main } from './pages/Main'
import { Settings } from './pages/Settings'
import { GatewayTest } from './pages/GatewayTest'

type Page = 'loading' | 'setup' | 'main' | 'settings' | 'gateway-test'

export function App() {
  const [page, setPage] = useState<Page>('loading')

  useEffect(() => {
    window.api.getConfig('setupComplete').then((done) => {
      setPage(done === true ? 'main' : 'setup')
    }).catch(() => {
      setPage('setup')
    })
  }, [])

  function handleSetupDone() {
    window.api.setConfig('setupComplete', true)
    setPage('main')
  }

  if (page === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#2b2d33]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  if (page === 'setup') {
    return <ClaudeSetup onDone={handleSetupDone} />
  }

  if (page === 'settings') {
    return (
      <Settings
        onBack={() => setPage('main')}
        onSetup={() => setPage('setup')}
        onGatewayTest={() => setPage('gateway-test')}
      />
    )
  }

  if (page === 'gateway-test') {
    return <GatewayTest onBack={() => setPage('settings')} />
  }

  return <Main onOpenSettings={() => setPage('settings')} />
}

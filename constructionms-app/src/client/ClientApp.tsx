'use client'

import dynamic from 'next/dynamic'
import { StrictMode } from 'react'

// The single-page app (react-router BrowserRouter) runs only in the browser, exactly as it
// did under Vite; Next.js serves the shell for every non-API path.
const App = dynamic(() => import('./LiveApp'), { ssr: false })

export default function ClientApp() {
  return (
    <StrictMode>
      <App />
    </StrictMode>
  )
}

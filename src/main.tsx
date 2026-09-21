import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <div className="beta-corner" aria-label="Nexo Study está en beta"><span>●</span> BETA</div>
    </AuthProvider>
  </React.StrictMode>,
)

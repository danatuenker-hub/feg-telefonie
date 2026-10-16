import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { configError } from './lib/supabase'
import App from './App'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

if (configError) root.render(<div className="center"><p className="error">Konfigurationsfehler: {configError}</p></div>)
else root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

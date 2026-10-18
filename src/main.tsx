import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('找不到應用程式掛載節點')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

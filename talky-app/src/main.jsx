import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Lesson from './Lesson.jsx'
import SoundBank from './SoundBank/SoundBank.jsx'
import SoundBankCategory from './SoundBank/SoundBankCategory.jsx'

// Auth0 Provider stuff
import { Auth0Provider } from '@auth0/auth0-react';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: window.location.origin }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App/>}/>
          <Route path="/lessons/:id" element={<Lesson/>}/>
          <Route path="/soundbank" element={<SoundBank/>}/>
          <Route path="/soundbank/:id" element={<SoundBankCategory/>}/>
        </Routes>
      </BrowserRouter>
    </Auth0Provider>
  </StrictMode>,
)

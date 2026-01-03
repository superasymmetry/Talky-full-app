import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Lesson from './Lesson/Lesson.jsx'
import SoundBank from './SoundBank/SoundBank.jsx'
import SoundBankCategory from './SoundBank/SoundBankCategory.jsx'
import Profile from './Auth0/Profile.jsx'
import Game from './Lesson/Game.jsx'

import { Auth0Provider } from '@auth0/auth0-react'
import LandingPage from './LandingPage.jsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App/>}/>
          <Route path="/lessons/:id" element={<Lesson/>}/>
          <Route path="/soundbank" element={<SoundBank/>}/>
          <Route path="/game" element={<Game/>}/>
          <Route path="/soundbank/:id" element={<SoundBankCategory/>}/>
          <Route path="/profile" element={<Profile/>}/>
          <Route path="/about" element={<LandingPage/>}/>
        </Routes>
      </BrowserRouter>
    </Auth0Provider>
  </StrictMode>,
)

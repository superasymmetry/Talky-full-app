import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Lesson from './Lesson/Lesson.jsx'
import SoundBank from './SoundBank/SoundBank.jsx'
import SoundBankCategory from './SoundBank/SoundBankCategory.jsx'
import Profile from './Auth0/Profile.jsx'
import Game from './Lesson/Game.jsx'
import Statistics from './Statistics/Statistics.jsx';

import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import LandingPage from './LandingPage/LandingPage.jsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

const UserCreator = ({ children }) => {
  const { user, isAuthenticated } = useAuth0()
  useEffect(() => {
    if (isAuthenticated && user) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
      fetch(`${API_BASE}/api/user/adduser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.sub || user.email, 
          name: user.name || user.nickname || user.email 
        })
      }).catch(err => console.error('Failed to create user:', err))
    }
  }, [isAuthenticated, user])
  
  return children
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience }}
    >
      <UserCreator>
        <BrowserRouter>
          <Routes>
            <Route path="/app" element={<App/>}/>
            <Route path="/lessons/:id" element={<Lesson />}/>
            <Route path="/soundbank" element={<SoundBank/>}/>
            <Route path="/game" element={<Game/>}/>
            <Route path="/soundbank/:id" element={<SoundBankCategory/>}/>
            <Route path="/profile" element={<Profile/>}/>
            <Route path="/statistics" element={<Statistics/>}/>
            <Route path="/" element={<LandingPage/>}/>
          </Routes>
        </BrowserRouter>
      </UserCreator>
    </Auth0Provider>
  </StrictMode>,
)

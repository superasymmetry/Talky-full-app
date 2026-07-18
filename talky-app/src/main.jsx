import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Lesson from './Lesson/Lesson.jsx'
import SoundBank from './SoundBank/SoundBank.jsx'
import SoundBankCategory from './SoundBank/SoundBankCategory.jsx'
import Profile from './Auth0/Profile.jsx'
import Statistics from './Statistics/Statistics.jsx';

import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import LandingPage from './LandingPage/LandingPage.jsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

// eslint-disable-next-line react-refresh/only-export-components
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

// Wraps Auth0Provider so we can use react-router's navigate() inside
// onRedirectCallback. Must render *inside* BrowserRouter for useNavigate to work.
// eslint-disable-next-line react-refresh/only-export-components
const Auth0ProviderWithNavigate = ({ children }) => {
  const navigate = useNavigate()

  const onRedirectCallback = (appState) => {
    // Without this, Auth0's default callback just strips the query params
    // and leaves you on whatever path the browser is currently on after
    // the redirect back from Auth0 — which, combined with redirect_uri
    // pointing at the bare origin, is why it was dumping everyone on "/".
    navigate(appState?.returnTo || '/app')
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience }}
      onRedirectCallback={onRedirectCallback}
      // Default is 'memory', which only lives for the current page load.
      // Any full navigation/refresh wiped the session, so /app always
      // looked logged-out even though the Auth0 session cookie was fine.
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
      {children}
    </Auth0Provider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Auth0ProviderWithNavigate>
        <UserCreator>
          <Routes>
            <Route path="/app" element={<App/>}/>
            <Route path="/lessons/:id" element={<Lesson />}/>
            <Route path="/soundbank" element={<SoundBank/>}/>
            <Route path="/soundbank/:id" element={<SoundBankCategory/>}/>
            <Route path="/profile" element={<Profile/>}/>
            <Route path="/statistics" element={<Statistics/>}/>
            <Route path="/" element={<LandingPage/>}/>
          </Routes>
        </UserCreator>
      </Auth0ProviderWithNavigate>
    </BrowserRouter>
  </StrictMode>,
)
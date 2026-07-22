import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Lesson from './Lesson/Lesson.jsx'
import SoundBank from './SoundBank/SoundBank.jsx'
import SoundBankCategory from './SoundBank/SoundBankCategory.jsx'
import VoiceSettings from './SoundBank/VoiceSettings.jsx'
import Profile from './Auth0/Profile.jsx'
import PracticeGame from './Lesson/PracticeGame.jsx'
import Statistics from './Statistics/Statistics.jsx';

import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import LandingPage from './LandingPage/LandingPage.jsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

// eslint-disable-next-line react-refresh/only-export-components
const UserCreator = ({ children }) => {
  const { user, isAuthenticated, getAccessTokenSilently } = useAuth0()

  useEffect(() => {
    if (!isAuthenticated || !user) return
    let cancelled = false

    async function createUser() {
      try {
        // /api/user/adduser is guarded by @requires_auth on the server,
        // so this call needs a Bearer token — without it, this always
        // 401'd silently (caught below, only logged to console).
        const token = await getAccessTokenSilently()
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
        await fetch(`${API_BASE}/api/user/adduser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          // userId isn't sent — the backend always derives the user's
          // identity from the token's sub claim and ignored this field
          // anyway, so sending it was misleading.
          body: JSON.stringify({ name: user.name || user.nickname || user.email })
        })
      } catch (err) {
        if (!cancelled) console.error('Failed to create user:', err)
      }
    }

    createUser()
    return () => { cancelled = true }
  }, [isAuthenticated, user, getAccessTokenSilently])

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
            <Route path="/practice-game" element={<PracticeGame/>}/>
            <Route path="/soundbank/:id" element={<SoundBankCategory/>}/>
            <Route path="/voice-settings" element={<VoiceSettings/>}/>
            <Route path="/profile" element={<Profile/>}/>
            <Route path="/statistics" element={<Statistics/>}/>
            <Route path="/" element={<LandingPage/>}/>
          </Routes>
        </UserCreator>
      </Auth0ProviderWithNavigate>
    </BrowserRouter>
  </StrictMode>,
)
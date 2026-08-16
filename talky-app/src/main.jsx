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
import StudentDetail from './Students/StudentDetail.jsx';

import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import LandingPage from './LandingPage/LandingPage.jsx'
import { preloadWav2Vec2 } from './Lesson/wav2vec2Client.js'

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

// eslint-disable-next-line react-refresh/only-export-components
const UserCreator = ({ children }) => {
  const { user, isAuthenticated, getAccessTokenSilently } = useAuth0()

  // Start downloading/compiling the on-device speech-evaluation model as soon
  // as someone is signed in, rather than waiting for a lesson to open — the
  // load takes long enough that a cold start made the first sentences of a
  // lesson fall back to server-side audio scoring. Gated on auth so anonymous
  // landing-page visitors don't pay for a model they'll never run.
  useEffect(() => {
    if (!isAuthenticated) return
    preloadWav2Vec2()
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !user) return
    let cancelled = false

    async function createUser() {
      try {
        const token = await getAccessTokenSilently()
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
        await fetch(`${API_BASE}/api/user/adduser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
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

// eslint-disable-next-line react-refresh/only-export-components
const Auth0ProviderWithNavigate = ({ children }) => {
  const navigate = useNavigate()

  const onRedirectCallback = (appState) => {
    navigate(appState?.returnTo || '/app')
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience }}
      onRedirectCallback={onRedirectCallback}
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
            <Route path="/students/:studentId" element={<StudentDetail/>}/>
            <Route path="/" element={<LandingPage/>}/>
          </Routes>
        </UserCreator>
      </Auth0ProviderWithNavigate>
    </BrowserRouter>
  </StrictMode>,
)
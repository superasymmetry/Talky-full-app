import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Lesson from './Lesson.jsx'
import SoundBank from './SoundBank/SoundBank.jsx'
import SoundBankCategory from './SoundBank/SoundBankCategory.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App/>}/>
        <Route path="/lessons/:id" element={<Lesson/>}/>
        <Route path="/soundbank" element={<SoundBank/>}/>
        <Route path="/soundbank/:id" element={<SoundBankCategory/>}/>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../Header/Header.jsx'
import Footer from '../Footer.jsx'
import Card from '../Card.jsx'

const samplePads = [
  'Ladybug','Elephant','Sleep','Baseball','Leaf','Lemon','Planet','Leg','Eleven','Letter','Laugh','Llama'
]

export default function SoundBankCategory(){
  const { id } = useParams()
  const navigate = useNavigate()
  const [words, setWords] = useState(samplePads)
  const tiltOptions = { max: 6, speed: 300, scale: 1.01 }

  async function refreshWords(){
    try {
      const res = await fetch('/api/generate-words')
      if (!res.ok) throw new Error('no gen')
      const json = await res.json()
      if (json.words && json.words.length) setWords(json.words)
    } catch (e) {
      console.warn('refresh failed, using sample pads', e)
    }
  }

  useEffect(() => {}, [id])

  return (
    <div className="min-h-screen bg-page">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/soundbank')} className="text-2xl text-primary font-bold">❮</button>
          <h2 className="text-3xl font-extrabold text-primary tracking-wider">{(id || '').replace('-', ' ').toUpperCase()}</h2>
          <div className="flex items-center gap-3">
            <button onClick={refreshWords} className="px-4 py-2 bg-primary text-white rounded-lg shadow">Refresh words</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {words.map((w, i) => (
            <div key={i} className="relative">
              <div className="absolute inset-0 transform translate-x-2 translate-y-2 bg-sky-50 rounded-xl"></div>
              <Card
                id={`pad-${i}`}
                name={w}
                options={tiltOptions}
                className="relative z-10 w-full rounded-xl bg-surface p-6 h-32 flex flex-col items-center justify-center shadow-md hover:shadow-lg transition text-primary"
              />
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
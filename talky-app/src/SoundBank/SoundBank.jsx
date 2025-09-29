import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../Header/Header.jsx'
import Footer from '../Footer.jsx'
import Card from '../Card.jsx'


const categories = [
  { id: 'l-sounds', name: 'L SOUNDS' },
  { id: 'r-sounds', name: 'R SOUNDS' },
  { id: '2-syllables', name: '2 SYLLABLES' },
  { id: '3-syllables', name: '3 SYLLABLES' },
  { id: 'th-sounds', name: 'TH SOUNDS' },
  { id: 's-sounds', name: 'S SOUNDS' },
  { id: 'z-sounds', name: 'Z SOUNDS' },
  { id: 'rhymes', name: 'RHYMES' },
]

export default function SoundBank() {
  const navigate = useNavigate()
  const tiltOptions = { max: 6, speed: 300, scale: 1.01 }

  return (
    <div className="min-h-screen bg-page">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* top title row */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-3xl text-primary font-extrabold">❮❮</button>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-primary tracking-widest drop-shadow-md">
              SUPER SOUND BANK
            </h1>
          </div>
        </div>

        {/* match the category page grid / tile sizing */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {categories.map(cat => (
            <div key={cat.id} className="relative">
              {/* increased backplate offset so shadow is more visible */}
              <div className="absolute inset-0 transform translate-x-2 translate-y-2 bg-sky-50 rounded-xl"></div>

              {/* taller front tile; pass titleClass to make label larger & centered */}
              <Card
                id={cat.id}
                name={cat.name}
                to={`/soundbank/${cat.id}`}
                options={tiltOptions}
                titleClass="mt-0 text-xl sm:text-2xl font-extrabold text-orange-500 tracking-wider text-center"
                className="relative z-10 w-full rounded-xl bg-surface p-6 h-32 flex items-center justify-center shadow-md hover:shadow-lg transition"
              />
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
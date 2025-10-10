import React from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../Header/Header.jsx'
import Footer from '../Footer.jsx'
import Card from '../Card.jsx'

const categories = [
  { 
    id: 'l-sounds', 
    name: 'L Sounds', 
    description: 'Words like "lion", "leaf", and "lamp"!' 
  },
  { 
    id: 'r-sounds', 
    name: 'R Sounds', 
    description: 'Words like "rabbit", "rose", and "rain".' 
  },
  { 
    id: '2-syllables', 
    name: '2 Syllables', 
    description: 'Words like "pencil", "apple", and "rocket".' 
  },
  { 
    id: '1-syllable', 
    name: '1 Syllable', 
    description: 'Words like "grass", "corn", and "kite".' 
  },
  { 
    id: 'th-sounds', 
    name: 'TH Sounds', 
    description: 'Words like "think", "bath", and "mother".' 
  },
  { 
    id: 's-sounds', 
    name: 'S Sounds', 
    description: 'Words like "sun", "sand", and "socks".' 
  },
  { 
    id: 'ch-sounds', 
    name: 'CH Sounds', 
    description: 'Words like "children", "chin", and "pinch".' 
  },
  { 
    id: 'sh-sounds', 
    name: 'SH Sounds', 
    description: 'Words like "bash", "shadow", and "shift".' 
  },
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
            <h1 className="ml-2 text-3xl sm:text-4xl font-extrabold text-primary tracking-widest drop-shadow-md">
              Super Sound Bank
            </h1>
          </div>
        </div>

        {/* grid for categories */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {categories.map(cat => (
            <Card
              key={cat.id}
              id={cat.id}
              name={cat.name}
              description={cat.description}
              to={`/soundbank/${cat.id}`}
              options={tiltOptions}
              titleClass="mt-0 text-xl sm:text-2xl font-extrabold text-orange-600 tracking-wider text-center"
              className="w-full h-35 flex flex-col items-center justify-center"
            />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}

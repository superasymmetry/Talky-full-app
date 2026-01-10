import React, { useState, useEffect, useRef} from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import Header from './Header/Header.jsx'
import Footer from './Footer.jsx'
import Card from './Card.jsx'
import './App.css'


function App() {
  const { user, isAuthenticated, isLoading } = useAuth0();
  const scroller = useRef(null);
  const [lessons, setLessons] = useState([]);
  
  useEffect(() => {
    if (isLoading) return;
    
    // Get userId from Auth0 if logged in, otherwise use demo
    const userId = isAuthenticated && user ? (user.sub || user.email) : 'demo';
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    
    fetch(`${API_BASE}/api/user/lessons?user_id=${userId}`)
      .then(res => res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`))
      .then(data => {
        const lessonsArray = Object.entries(data.lessons || {})
          .map(([key, lesson]) => ({
            id: isNaN(key) ? key : Number(key),
            name: isNaN(key) ? key : `Lesson ${key}`,
            description: lesson.words?.join(', ') || lesson.phoneme || '',
            img: key.toLowerCase() === 'game' ? 'gamecontroller.png' : 'rocketship.png'
          }))
          .sort((a, b) => (typeof a.id === 'number' ? a.id : Infinity) - (typeof b.id === 'number' ? b.id : Infinity));
        
        setLessons(lessonsArray);
      })
      .catch(err => console.error('Failed to fetch lessons:', err));
  }, [isAuthenticated, isLoading, user]);
  const soundBankCard = { id: "soundbank", name: "Sound Bank", description: "Browse sound categories", to: "/soundbank" }
  const scrollBy = (delta) => scroller.current?.scrollBy({ left: delta, behavior: 'smooth' })

  return (
    <>
      <Header />
      <div className="max-w-6xl mx-auto px-4">
        <section aria-labelledby="lessons-heading" className="mb-5 mt-10">
          <h2 id="lessons-heading" className="text-xl text-white font-semibold mb-4">Lessons</h2>

          <div className="slider-shell">
            <button onClick={() => scrollBy(-300)} className="px-3 py-2 rounded bg-gray-200">‹</button>
            <div
              ref={scroller}
              className="slider-row no-scrollbar"
            >
              {lessons.map((card, index) => (
                <div key={card.id} className="min-w-[240px] snap-center" style={{ position: 'relative' }}>
                  <Card {...card} showRocket={true} disabled={index === lessons.length - 1}/>
                  {index === lessons.length - 1 && (
                    <img src="/padlock.jpg"
                        style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 80,
                        height: 80,
                        pointerEvents: 'none',
                      }}/>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => scrollBy(300)} className="px-3 py-2 rounded bg-gray-200">›</button>
          </div>
        </section>

        <section aria-labelledby="soundbank-heading" className="mt-8">
          <h2 id="soundbank-heading" className="text-xl text-white font-semibold mb-4">Explore</h2>
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <Card {...soundBankCard} />
            </div>
          </div>
        </section>
      </div>
      <br /><br />
      <Footer />
    </>
  );
}

export default App
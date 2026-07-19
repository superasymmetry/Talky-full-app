import './App.css'

import React, { useEffect, useRef, useState } from 'react'

import Card from './Card.jsx'
import Footer from './Footer.jsx'
import Header from './Header/Header.jsx'
import { useAuth0 } from '@auth0/auth0-react'

function App() {
  const { user, isAuthenticated, isLoading } = useAuth0();
  const scroller = useRef(null);
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    if (isLoading) return;

    const userId = isAuthenticated && user ? (user.sub || user.email) : 'demo';
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

    fetch(`${API_BASE}/api/user/lessons?user_id=${userId}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch lessons')))
      .then(data => {
        const lessonsArray = (data.lessons || []).map(lesson => ({
          id: lesson.id,
          name: `Lesson ${lesson.id}`,
          description: lesson.words?.join(', ') || lesson.phoneme || '',
          img: 'rocketship.png'
        }));

        setLessons(lessonsArray);
      })
      .catch(err => console.error('Failed to fetch lessons:', err));
  }, [isAuthenticated, isLoading, user]);
  const soundBankCard = { id: "soundbank", name: "Sound Bank", description: "Browse sound categories", to: "/soundbank" }
  const practiceCard = { id: "practice", name: "Practice Game", description: "Build your phoneme city!", to: "/practice-game" }
  const scrollBy = (delta) => scroller.current?.scrollBy({ left: delta, behavior: 'smooth' })

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="max-w-6xl mx-auto px-4 flex-grow w-full">
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
                  <Card
                    {...card}
                    showRocket={true}
                    disabled={index === lessons.length - 1}
                    id={`${card.id}`}
                    data-testid="lesson-card"
                  />
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

        <section aria-labelledby="soundbank-heading" className="mt-8 mb-12">
          <h2 id="soundbank-heading" className="text-xl text-white font-semibold mb-4">Explore</h2>
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <Card {...soundBankCard} data-testid="soundbank-card" />
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}

export default App
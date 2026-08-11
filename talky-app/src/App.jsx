import './App.css'
import './Statistics/Statistics.css'

import React, { useEffect, useRef, useState } from 'react'

import Card from './Card.jsx'
import Footer from './Footer.jsx'
import Header from './Header/Header.jsx'
import { useAuth0 } from '@auth0/auth0-react'
import { makeAuthFetch } from './utils/authFetch.js'

function App() {
  const { user, isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  const scroller = useRef(null);
  const [lessons, setLessons] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);
  const [pendingAssignedLesson, setPendingAssignedLesson] = useState(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) return;

    const userId = user.sub || user.email;
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    const authFetch = makeAuthFetch(getAccessTokenSilently);

    authFetch(`${API_BASE}/api/user/lessons?user_id=${userId}`)
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

    authFetch(`${API_BASE}/api/user/student/${userId}/detail`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        setActiveGoal(data.activeGoal || null);
        setPendingAssignedLesson(data.pendingAssignedLesson || null);
      })
      .catch(err => console.error('Failed to fetch goal/assignment:', err));
  }, [isAuthenticated, isLoading, user, getAccessTokenSilently]);
  const soundBankCard = { id: "soundbank", name: "Sound Bank", description: "Browse sound categories", to: "/soundbank" }
  const practiceCard = { id: "practice", name: "Practice Game", description: "Build your phoneme city!", to: "/practice-game" }
  const scrollBy = (delta) => scroller.current?.scrollBy({ left: delta, behavior: 'smooth' })

  return (
    <div className="dashboard-shell">
      <Header />
      <div
        className="dashboard-main max-w-7xl mx-auto px-4 w-full"
        style={{ paddingTop: 'var(--header-height, 85px)' }}
      >
        {(pendingAssignedLesson || activeGoal) && (
          <div className="cut-card mt-4 px-4 py-3 bg-n-7 border border-color-1/30 text-n-1">
            {pendingAssignedLesson ? (
              <p className="body-2 m-0">
                🎯 Your teacher picked your next lesson: <span className="font-mono">/{pendingAssignedLesson.phoneme}/</span> — {pendingAssignedLesson.words.join(', ')}
              </p>
            ) : (
              <p className="body-2 m-0">
                🎯 Your teacher wants you to focus on the <span className="font-mono">/{activeGoal.phoneme}/</span> sound
                {activeGoal.note ? ` — "${activeGoal.note}"` : ''}
              </p>
            )}
          </div>
        )}

        <section aria-labelledby="lessons-heading" className="dashboard-lessons mb-4 mt-4">
          <h2 id="lessons-heading" className="text-xl text-white font-semibold mb-2">Lessons</h2>

          <div className="slider-shell">
            <button
              onClick={() => scrollBy(-300)}
              aria-label="Scroll lessons left"
              className="cut-chip px-3 py-2 bg-n-7 text-n-1 border border-n-1/10 hover:text-color-1"
            >
              ‹
            </button>
            <div
              ref={scroller}
              className="slider-row no-scrollbar"
            >
              {lessons.map((card, index) => (
                <div key={card.id} className="lesson-slide h-full snap-center" style={{ position: 'relative' }}>
                  <Card
                    {...card}
                    className="lesson-card"
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
            <button
              onClick={() => scrollBy(300)}
              aria-label="Scroll lessons right"
              className="cut-chip px-3 py-2 bg-n-7 text-n-1 border border-n-1/10 hover:text-color-1"
            >
              ›
            </button>
          </div>
        </section>

        <section aria-labelledby="soundbank-heading" className="dashboard-explore mt-2 mb-4">
          <h2 id="soundbank-heading" className="text-xl text-white font-semibold mb-2">Explore</h2>
          <div className="flex justify-center gap-4 flex-wrap">
            <div className="w-full max-w-sm">
              <Card {...soundBankCard} data-testid="soundbank-card" />
            </div>
            <div className="w-full max-w-sm">
              <Card {...practiceCard} data-testid="practice-card" />
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}

export default App
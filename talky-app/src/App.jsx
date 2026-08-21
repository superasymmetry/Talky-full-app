import './App.css'
import './Statistics/Statistics.css'

import React, { useEffect, useRef, useState } from 'react'

import Card from './Card.jsx'
import Footer from './Footer.jsx'
import Header from './Header/Header.jsx'
import { makeAuthFetch } from './utils/authFetch.js'
import { scoreToStars } from './Lesson/summaryDerive.js'
import { useAuth0 } from '@auth0/auth0-react'
import { useUserProvisioned } from './utils/userProvisioned.js'

const TOTAL_ASSESSMENT_STEPS = 6;

function starString(score) {
  const filled = scoreToStars(score);
  return '⭐'.repeat(filled) + '☆'.repeat(3 - filled);
}

// to decide whether to show the assessment batch or normal lessons
function currentAssessmentBatch(rawLessons) {
  const batch = [];
  for (let i = rawLessons.length - 1; i >= 0; i--) {
    if (!rawLessons[i].is_assessment) break;
    batch.unshift(rawLessons[i]);
  }
  return batch;
}

function App() {
  const { user, isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const provisioned = useUserProvisioned();
  const scroller = useRef(null);
  const [lessons, setLessons] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);
  const [pendingAssignedLesson, setPendingAssignedLesson] = useState(null);
  
  const [inAssessmentPhase, setInAssessmentPhase] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) return;
    if (!provisioned) return;

    const userId = user.sub || user.email;
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    const authFetch = makeAuthFetch(getAccessTokenSilently);

    authFetch(`${API_BASE}/api/user/lessons?user_id=${userId}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch lessons')))
      .then(data => {
        
        const rawLessons = data.lessons || [];
        const batch = currentAssessmentBatch(rawLessons);
        const nowInAssessment = batch.length > 0;
        const nonAssessmentLessons = rawLessons.filter(l => !l.is_assessment);
        const visibleLessons = nowInAssessment ? batch : nonAssessmentLessons;

        const lessonsArray = visibleLessons.map((lesson, i) => {
          const isCurrent = i === visibleLessons.length - 1;
          return {
            id: lesson.id,
            name: nowInAssessment
              ? `Assessment ${i + 1}/${TOTAL_ASSESSMENT_STEPS}`
              : `Lesson ${i + 1}`,
            description: lesson.words?.join(', ') || lesson.phoneme || '',
            content: isCurrent ? undefined : starString(lesson.score),
            img: 'rocketship.png',
            is_assessment: nowInAssessment,
            locked: false,
          };
        });

        if (nowInAssessment) {
          const remaining = data.assessmentRemaining || 0;
          for (let i = 0; i < remaining; i++) {
            const stepNumber = visibleLessons.length + i + 1;
            lessonsArray.push({
              id: `assessment-locked-${stepNumber}`,
              name: `Assessment ${stepNumber}/${TOTAL_ASSESSMENT_STEPS}`,
              description: 'Locked',
              img: 'rocketship.png',
              is_assessment: true,
              locked: true,
            });
          }
        }

        setLessons(lessonsArray);
        setInAssessmentPhase(nowInAssessment);
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
  }, [isAuthenticated, isLoading, user, provisioned, getAccessTokenSilently]);
  const soundBankCard = { id: "soundbank", name: "Sound Bank", description: "Browse sound categories", to: "/soundbank" }
  const practiceCard = { id: "practice", name: "Practice Game", description: "Build your phoneme city!", to: "/practice-game" }
  const scrollBy = (delta) => scroller.current?.scrollBy({ left: delta, behavior: 'smooth' })

  // Without this, visiting /app while signed out (or after a session expires) rendered the full dashboard shell with nothing in it
  if (!isLoading && (!isAuthenticated || !user)) {
    return (
      <div className="dashboard-shell">
        <Header />
        <div
          className="dashboard-main max-w-7xl mx-auto px-4 w-full flex flex-col items-center justify-center text-center"
          style={{ paddingTop: 'var(--header-height, 85px)', minHeight: '60vh' }}
        >
          <h2 className="text-xl text-white font-semibold mb-2">Sign in to see your lessons</h2>
          <p className="body-2 text-n-3 mb-4">Your lessons, progress, and stats are all tied to your account.</p>
          <button
            type="button"
            onClick={() => loginWithRedirect({ appState: { returnTo: '/app' } })}
            className="cut-chip px-4 py-2 bg-color-1 text-n-8 border border-color-1 font-semibold"
          >
            Sign In
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <Header />
      <div
        className="dashboard-main max-w-7xl mx-auto px-4 w-full"
        style={{ paddingTop: 'var(--header-height, 85px)' }}
      >
        {inAssessmentPhase && (
          <div className="cut-card mt-4 px-4 py-3 bg-n-7 border border-color-1/30 text-n-1">
            <p className="body-2 m-0">
              🎤 Quick assessment in progress — a few short sounds so we can build lessons around what you actually need to work on.
            </p>
          </div>
        )}

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
          <h2 id="lessons-heading" className="text-xl text-white font-semibold mb-2">
            {inAssessmentPhase ? 'Quick Assessment' : 'Lessons'}
          </h2>

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
              {lessons.map((card) => {
                return (
                <div key={card.id} className="lesson-slide h-full snap-center" style={{ position: 'relative' }}>
                  <Card
                    {...card}
                    className="lesson-card"
                    showRocket={true}
                    disabled={card.locked}
                    id={`${card.id}`}
                    data-testid="lesson-card"
                  />
                  {card.locked && (
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
                );
              })}
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
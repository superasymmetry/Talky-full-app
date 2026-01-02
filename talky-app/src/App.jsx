import React, {useRef} from 'react'
import Header from './Header/Header.jsx'
import Footer from './Footer.jsx'
import Card from './Card.jsx'
import './App.css'


function App() {
  const scroller = useRef(null);
  const lessons = [
    { id: 1, name: "Lesson 1", description: "lorem ipsum 1", img: "meltingrubix.png" },
    { id: 2, name: "Lesson 2", description: "lorem ipsum 2", img: "alice.png" },
    { id: 3, name: "Lesson 3", description: "lorem ipsum 3", img: "bob.png" },
    { id: 4, name: "Lesson 4", description: "lorem ipsum 3", img: "bob.png" },
    { id: 5, name: "Lesson 5", description: "lorem ipsum 3", img: "bob.png" },
    { id: 6, name: "Lesson 6", description: "lorem ipsum 3", img: "bob.png" },
    { id: 7, name: "Lesson 7", description: "lorem ipsum 3", img: "bob.png" },
    { id: 8, name: "Lesson 8", description: "lorem ipsum 3", img: "bob.png" },
    { id: 9, name: "Lesson 9", description: "lorem ipsum 3", img: "bob.png" },
    { id: 10, name: "Game", description: "a fun game", img: "gamecontroller.png" },
  ]

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
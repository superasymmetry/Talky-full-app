import React from 'react'
import Header from './Header/Header.jsx'
import Footer from './Footer.jsx'
import Card from './Card.jsx'
import './App.css'
import { useAuth0 } from '@auth0/auth0-react'
import LoginButton from './components/LoginButton.jsx'

function App() {

  const { user, isAuthenticated } = useAuth0();

  const lessons = [
    { id:1, name: "Lesson 1", description: "lorem ipsum 1", img: "meltingrubix.png" },
    { id:2, name: "Lesson 2", description: "lorem ipsum 2", img: "alice.png" },
    { id:3, name: "Lesson 3", description: "lorem ipsum 3", img: "bob.png" },
  ]

  const soundBankCard = { id: "soundbank", name: "Sound Bank", description: "Browse sound categories", to: "/soundbank" }

  function handleSearch() { console.log("searching..."); }

  if (!isAuthenticated) {
    return (
      <div>
        <p>Please log in to access the lessons.</p>
        <LoginButton />
      </div>
    )
  }

  return (
    <>
      <Header/>

      <div className="max-w-6xl mx-auto px-4">
        {/*}
        <div className="my-6 flex items-center gap-3">
          <input type="text" className="search-container flex-1" placeholder="Search..."/>
          <button className="search-button" onClick={handleSearch}>Search</button>
        </div>
        */}
        {/* FORCE 3 columns for lessons (will always be 3 columns) */}
        <section aria-labelledby="lessons-heading" className="mb-5 mt-10">
          <h2 id="lessons-heading" className="sr-only">Lessons</h2>

          {/* important: grid-cols-3 forces three columns; change to sm:grid-cols-3 if you want responsive */}
          <div className="grid grid-cols-3 gap-6 items-stretch">
            {lessons.map((card) => (
              <div className="w-full" key={card.id}>
                <Card {...card} showRocket={true}/>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="soundbank-heading" className="mt-8">
          <h2 id="soundbank-heading" className="text-xl font-semibold mb-4">Explore</h2>
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <Card {...soundBankCard} />
            </div>
          </div>
        </section>
      </div>
      <br></br><br></br>
      <Footer/>
    </>
  );
}

export default App
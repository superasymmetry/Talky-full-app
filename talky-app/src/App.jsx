import Header from './Header/Header.jsx'
import Footer from './Footer.jsx'
import Card from './Card.jsx'
import Button from './Button/Button.jsx'
import './App.css'
import VanillaTilt from 'vanilla-tilt';
import React, {useRef, useEffect} from 'react';


function App() {
  const cards = [
    {"id":1, "name": "Lesson 1", "description": "lorem ipsum 1", "img": "meltingrubix.png"},
    {"id":2, "name": "Lesson 2", "description": "lorem ipsum 2", "img": "alice.png"},
    {"id":3, "name": "Lesson 3", "description": "lorem ipsum 3", "img": "bob.png"}
  ]
  
  function handleSearch() {
    console.log("searching...");
  }

  return (
    <>
      <Header/>
      <input type="text" className="search-container" placeholder="Search..."></input>
      <button className="search-button" onClick={handleSearch}></button>
      <div className='card-container'>
        {cards.map(function(card, i){
          return <Card key={i} id={card.id} name={card.name} description={card.description}/>
        })}
      </div>
      <Footer/>
    </>
  );
}

export default App

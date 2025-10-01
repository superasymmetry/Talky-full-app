import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../Header/Header.jsx';
import Footer from '../Footer.jsx';
import Card from '../Card.jsx';

const samplePads = [
  'Ladybug','Elephant','Sleep','Baseball','Leaf','Lemon','Planet','Leg','Eleven','Letter','Laugh','Llama'
];

// ----- Randomizer Tile Component -----
function SoundBank({ tiles, highlightedIndex, selectedIndex, setHighlightedIndex, setSelectedIndex, isRandomizing }) {
  const tiltOptions = { max: 6, speed: 300, scale: 1.01 };

  const speakWord = (word) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v =>
      v.lang === "en-US" && /female/i.test(v.name)
    ) || voices.find(v => v.lang === "en-US") || voices[0];
    utterance.voice = femaleVoice;

    utterance.onend = () => {
      setSelectedIndex(null);
      setHighlightedIndex(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-6">
      {tiles.map((tile, index) => {
        const isHighlighted = highlightedIndex === index;
        const isSelected = selectedIndex === index;

        return (
          <div
            key={tile}
            className="relative cursor-pointer"
            onClick={() => {
              if (!isRandomizing) {
                speakWord(tile);
                setSelectedIndex(index);
                setHighlightedIndex(index);
              }
            }}
          >
            {/* highlight ring */}
            <div
              className={`absolute inset-0 rounded-xl pointer-events-none transition-all duration-150
                ${isHighlighted ? `
                  ring-8 ring-yellow-400
                  shadow-lg shadow-yellow-400/70
                  hover:shadow-orange-400/70
                  animate-pulse
                ` : ""}
                ${isSelected ? "ring-4 ring-pink-400 shadow-pink-400/70" : ""}`}
            ></div>

            <Card
              id={`pad-${index}`}
              name={tile}
              options={tiltOptions}
              noNavigate={true}
              className="relative z-10 w-full h-32 flex flex-col items-center justify-center"
            />
          </div>
        );
      })}
    </div>
  );
}

// ----- Page Component -----
export default function SoundBankCategory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [words, setWords] = useState(samplePads);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isRandomizing, setIsRandomizing] = useState(false);

  const refreshWords = async () => {
    const words = await fetch(`http://localhost:8080/api/wordbank?category=${id}`)
    const data = await words.json();
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    const wordsArray = Object.values(parsedData);
    console.log("Words array:", wordsArray);
    setWords(wordsArray);
  };

  const handleRandomize = () => {
    setIsRandomizing(true);
    let iterations = 0;
    const totalIterations = 30 + Math.floor(Math.random() * 20);
    let delay = 50;

    const spin = () => {
      const nextIndex = Math.floor(Math.random() * words.length);
      setHighlightedIndex(nextIndex);
      iterations++;

      if (iterations < totalIterations) {
        delay *= 1.05;
        setTimeout(spin, delay);
      } else {
        setSelectedIndex(nextIndex);
        setIsRandomizing(false);
      }
    };

    spin();
  };

  return (
    <div className="min-h-screen bg-page">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/soundbank')} className="text-2xl text-primary font-bold">❮</button>
          <h2 className="text-3xl font-extrabold text-orange-600 tracking-wider">{(id || '').replace('-', ' ').toUpperCase()}</h2>
          <div className="flex items-center gap-3">
            <button onClick={refreshWords} className="px-4 py-2 bg-primary rounded-lg shadow">Refresh words</button>
            <button 
              onClick={handleRandomize} 
              disabled={isRandomizing}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 disabled:opacity-50"
            >
              Randomize
            </button>
          </div>
        </div>

        <SoundBank 
          tiles={words} 
          highlightedIndex={highlightedIndex} 
          selectedIndex={selectedIndex} 
          setHighlightedIndex={setHighlightedIndex} 
          setSelectedIndex={setSelectedIndex} 
          isRandomizing={isRandomizing}
        />
      </main>
      <Footer />
    </div>
  );
}

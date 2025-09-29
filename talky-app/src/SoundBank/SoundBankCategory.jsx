import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../Header/Header.jsx';
import Footer from '../Footer.jsx';
import Card from '../Card.jsx';
import { generateWords } from "../genWords.js";

// Default words if no generated words
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
            <div
              className={`absolute inset-0 rounded-xl transition-all duration-150
                ${isHighlighted ? "bg-yellow-300 scale-105 shadow-[0_0_12px_rgba(20,0,0,0.8)] animate-pulse" : ""}
                ${isSelected ? "bg-pink-400 scale-110 shadow-[0_0_18px_rgba(0,255,0,0.9)]" : ""}`}
            ></div>

            <Card
              id={`pad-${index}`}
              name={tile}
              options={tiltOptions}
              noNavigate={true}
              className="relative z-10 w-full rounded-xl bg-surface p-6 h-32 flex flex-col items-center justify-center shadow-md hover:shadow-lg transition text-primary"
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
    console.log(data);
    setWords(data);
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
          <h2 className="text-3xl font-extrabold text-primary tracking-wider">{(id || '').replace('-', ' ').toUpperCase()}</h2>
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

        {/* --- SoundBank Tiles --- */}
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

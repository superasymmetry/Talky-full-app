import React, {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';
import { useAudioRecorder } from "react-use-audio-recorder";
import './Lesson.css';

function Lesson() {
    const { id } = useParams();
    // get backend data
    const [cardData, setCardData] = useState(null);
    const {
        recordingStatus,
        recordingTime,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        getBlob,
        saveRecording,
    } = useAudioRecorder();

    useEffect(() => {
        fetch("http://localhost:8080/api/lessons")
            .then(response => response.json())
            .then(data => {
                const parsedData = JSON.parse(data); // Parse the string into JSON
                setCardData(parsedData);
            })
            .catch(error => console.error('Error fetching data:', error));
    }, []);
    console.log("cardData:", cardData);

    const speakSentence = (sentence) => {
        const utterance = new SpeechSynthesisUtterance(sentence);
        window.speechSynthesis.speak(utterance);
    };

    useEffect(() => {
        if (cardData) {
            console.log("Type of cardData:", typeof cardData);
            const firstSentence = cardData["1"]; // Access the first sentence using the key "1"
            console.log("First sentence:", firstSentence);
            speakSentence(firstSentence);
        }
    }, [cardData]);

    return (
        <div>
            <div>
                <img className='talking-man' src="../assets/talking-man.gif" alt="Talking man" />
            </div>
            <div>
                {recordingStatus === 'recording' ? (
                    <button
                        className='record-button'
                        onClick={() => stopRecording((blob) => { saveRecording(); })}
                        aria-label="Stop recording"
                    >
                        <img src="../assets/stop-record-button.webp" alt="Stop" />
                    </button>
                ) : (
                    <button className='record-button' onClick={startRecording} aria-label="Start recording">
                        <img src="../assets/start-record-button.png" alt="Start" />
                    </button>
                )}
            </div>
        </div>
    )
}

export default Lesson
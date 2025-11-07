import React, { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./Lesson.css";

function Lesson() {
    const { id } = useParams();
    const [cardData, setCardData] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioURL, setAudioURL] = useState("");
    const mediaRecorderRef = useRef(null);

    // Fetch lesson data
    useEffect(() => {
        fetch("http://localhost:8080/api/lessons")
            .then((response) => response.json())
            .then((data) => {
                const parsedData = JSON.parse(data);
                setCardData(parsedData);
            })
            .catch((error) => console.error("Error fetching data:", error));
    }, []);

    // Speak the first sentence
    useEffect(() => {
        if (cardData) {
            const firstSentence = cardData["1"];
            const utterance = new SpeechSynthesisUtterance(firstSentence);
            window.speechSynthesis.speak(utterance);
        }
    }, [cardData]);

    // Start recording
    const startRecording = async () => {
        setIsRecording(true);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);

        const chunks = [];
        mediaRecorder.ondataavailable = (event) => {
            chunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: "audio/wav" });
            setAudioBlob(blob);
            const url = URL.createObjectURL(blob);
            setAudioURL(url);
            setIsRecording(false);
        };

        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
    };

    // Stop recording
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
            setIsRecording(false);
        }
    };

    // Upload the audio to the backend
    const uploadRecording = async () => {
        if (audioBlob) {
            const formData = new FormData();
            formData.append("lesson_id", id);
            formData.append("audio", audioBlob, `lesson_${id}.webm`);

            try {
                const response = await fetch("http://localhost:8080/api/evaluate", {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error("Failed to upload recording");
                }

                const result = await response.json();
                console.log("Evaluation result:", result);
                // Handle the result (e.g., display the score)
            } catch (error) {
                console.error("Error uploading recording:", error);
            }
        }
    };

    return (
        <div className="lesson-container">
            <div className="lesson-header">
                <h1>Lesson {id}</h1>
                <p>Listen and repeat the sentence</p>
            </div>

            <div className="lesson-content">
                <div className="avatar-section">
                    <img className='talking-man' src="../assets/talking-man.gif" alt="Talking man" />
                </div>

                <div className="recording-section">
                    <div className="recording-controls">
                        {!isRecording ? (
                            <button
                                className='record-button start'
                                onClick={startRecording}
                                aria-label="Start recording"
                            >
                                <img src="../assets/start-record-button.png" alt="Start" />
                                <span>Start Recording</span>
                            </button>
                        ) : (
                            <button
                                className='record-button stop'
                                onClick={stopRecording}
                                aria-label="Stop recording"
                            >
                                <img src="../assets/stop-record-button.webp" alt="Stop" />
                                <span>Stop Recording</span>
                            </button>
                        )}
                    </div>

                    {audioURL && (
                        <div className="playback-section">
                            <audio controls src={audioURL}></audio>
                            <button
                                className="upload-button"
                                onClick={uploadRecording}
                            >
                                Submit Recording
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Lesson;
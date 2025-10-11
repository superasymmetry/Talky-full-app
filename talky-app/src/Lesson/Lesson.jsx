import React, {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';
import './Lesson.css';

function Lesson() {
    const { id } = useParams();
    // get backend data
    const [cardData, setCardData] = useState(null);
    useEffect(() => {
        fetch("http://localhost:8080/api/lessons")
            .then(response => response.json())
            .then(data => setCardData(data))
            .catch(error => console.error('Error fetching data:', error));
    }, []);

    return (
        <div>
            <h1 className='lesson-title'>Welcome to Talky's lesson {id}!</h1>
            <img className='talking-man' src="../assets/talking-man.gif" alt="Talking man" />
            
        </div>
    )
}

export default Lesson
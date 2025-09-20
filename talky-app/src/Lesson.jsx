import React, {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';

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
            <h1>Lesson {id}</h1>
            {cardData ? (
                <div>
                    <p>{cardData[0].title}</p>
                    <p>{cardData[0].content}</p>
                </div>
            ) : (
                <p>wait</p>
            )}
        </div>
    )
}

export default Lesson
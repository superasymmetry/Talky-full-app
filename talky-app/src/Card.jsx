import profilePic from './assets/meltingrubix.png'
import VanillaTilt from 'vanilla-tilt';
import React, {useRef, useEffect} from 'react';
import { useNavigate } from 'react-router-dom';

function Card (props){
    const tilt = useRef(null);
    const {options, ...rest} = props;
    useEffect(() => {
        VanillaTilt.init(tilt.current, options)
    }, [options]);

    const navigate = useNavigate();
    const handleCardClick = () => {
        navigate(`/lessons/${props.id}`);
    }

    // get backend data
    const [cardData, setCardData] = useState(null);
    useEffect(() => {
        fetch("http://localhost:8080/api/lessons")
            .then(response => response.json())
            .then(data => setCardData(data));
    }, [])

    return (
        <div ref={tilt} {...rest} className="card" id={props.id} onClick={handleCardClick}>
            <img src={profilePic} alt="profile pic"></img>
            <h3>{props.name}</h3>
            <p>{props.description}</p>
        </div>
    )
}

export default Card
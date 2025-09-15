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
        navigate(`/lesson`);
    }

    return (
        <div ref={tilt} {...rest} className="card" onClick={handleCardClick}>
            <img src={profilePic} alt="profile pic"></img>
            <h3>{props.name}</h3>
            <p>{props.description}</p>
        </div>
    )
}

export default Card
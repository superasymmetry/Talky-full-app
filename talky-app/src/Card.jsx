// React card component used across the app to display a clickable card (lessons, soundbank categories, etc.)

import profilePic from './assets/meltingrubix.png'
import VanillaTilt from 'vanilla-tilt';
import React, {useRef, useEffect, useState} from 'react';
import { useNavigate } from 'react-router-dom';

function Card (props){
    const tilt = useRef(null);
    // accept className and titleClass so callers can style the container and title
    const { options, to, id, className = '', titleClass = '', noNavigate = false, ...rest } = props;

    useEffect(() => {
        if (tilt.current) VanillaTilt.init(tilt.current, options)
    }, [options]);

    const navigate = useNavigate();
    const handleCardClick = () => {
        if (noNavigate) return; // do nothing if navigation is disabled
        
        if (to && typeof to === 'string') {
            const path = to.startsWith('/') ? to : `/${to}`;
            navigate(path);
            return;
        }
        if (id !== undefined && id !== null) {
            if (typeof id === 'string' && id.startsWith('/')) {
                navigate(id);
            } else {
                navigate(`/lessons/${id}`);
            }
        }
    }

    const [cardData, setCardData] = useState(null);
    useEffect(() => {
        fetch("http://localhost:8080/api/lessons")
            .then(response => response.json())
            .then(data => setCardData(data))
            .catch(error => console.error('Error fetching data:', error));
    }, [])

    const base = `
        w-full h-full
        bg-gradient-to-br from-electric/30 to-white
        rounded-2xl
        shadow-pokemon
        p-6
        cursor-pointer
        transform hover:-translate-y-2 hover:scale-105
        transition-all duration-300 ease-out
        border-4 border-electric
    `;

    const mergedClass = `${base} ${className}`.trim();

    return (
        <div
          ref={tilt}
          {...rest}
          id={id}
          onClick={handleCardClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(); }}
          className={mergedClass}
        >
            <img src={profilePic} alt="profile pic" className="block max-w-[64px] w-full h-auto object-contain rounded-md mx-auto" />
            {/* use titleClass when provided, otherwise fallback to default */}
            <h3 className={titleClass || "mt-3 text-lg font-semibold text-center"}>{props.name}</h3>
            <p className="text-sm text-gray-600 text-center">{props.description}</p>
            <p className="text-xs text-gray-500 mt-2 text-center">{props.content}</p>
        </div>
    )
}

export default Card
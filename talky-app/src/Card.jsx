// React card component used across the app to display a clickable card (lessons, soundbank categories, etc.)

import profilePic from './assets/meltingrubix.png';
import talkyRocket from './assets/logo.png';
import VanillaTilt from 'vanilla-tilt';
import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Card(props) {
    const tilt = useRef(null);
    const { options, to, id, className = '', titleClass = '', noNavigate = false, showRocket = false, ...rest } = props;

    useEffect(() => {
        if (tilt.current) VanillaTilt.init(tilt.current, options)
    }, [options]);

    const navigate = useNavigate();
    const handleCardClick = () => {
        if (noNavigate) return;

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

    return (
        <div
            ref={tilt}
            {...rest}
            id={id}
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(); }}
            className={`relative group cursor-pointer ${className}`}
        >
            {/* Gradient border wrapper */}
            <div className="
                absolute inset-0 rounded-2xl
                p-[2px] w-full h-full
                bg-transparent
                group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:via-blue-500 group-hover:to-sky-600
                group-hover:bg-[length:200%_200%] group-hover:animate-[borderGlow_6s_linear_infinite]
                transition-all duration-300
            "></div>

            {/* Inner card */}
            <div
                className="
                    relative rounded-2xl p-6 w-full h-full
                    bg-white/75
                    backdrop-blur-md
                    shadow-[0_8px_20px_rgba(0,120,255,0.4)]
                    transition-all duration-300
                    group-hover:bg-white/90
                    group-hover:shadow-[0_0_10px_rgba(0,180,255,0.6),0_0_20px_rgba(0,120,255,0.4),0_0_30px_rgba(0,120,255,0.25)]
                    transform group-hover:-translate-y-2 group-hover:scale-105
                "
            >
                {/* Only show rocket if showRocket is true */}
                {showRocket && (
                    <img
                        src={talkyRocket}
                        alt="talky rocket"
                        className="block max-w-[64px] w-full h-auto object-contain rounded-md mx-auto"
                    />
                )}
                <h3 className={titleClass || "mt-3 text-lg font-semibold text-center text-slate-900"}>{props.name}</h3>
                <p className="text-sm text-slate-700 text-center">{props.description}</p>
                <p className="text-xs text-slate-600 mt-2 text-center">{props.content}</p>
            </div>
        </div>
    )
}

export default Card;

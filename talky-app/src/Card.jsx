import talkyRocket from './assets/logo.png';
import VanillaTilt from 'vanilla-tilt';
import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Card(props) {
    const tilt = useRef(null);
    const {
        disabled,
        options,
        to,
        id,
        className = '',
        titleClass = '',
        noNavigate = false,
        showRocket = false,
        isLoading = false,
        name = '',
        description,
        content,
        ...rest
    } = props;

    useEffect(() => {
        if (disabled || !tilt.current) return;
        if (tilt.current) VanillaTilt.init(tilt.current, options)
        
        return () => {
            if (tilt.current) {
                tilt.current.vanillaTilt?.destroy();
            }
        }
    }, [options, disabled]);

    const navigate = useNavigate();
    const handleCardClick = () => {
        if (disabled || noNavigate) return;

        if (to && typeof to === 'string') {
            const path = to.startsWith('/') ? to : `/${to}`;
            navigate(path);
            return;
        }
        if (name === "Game") {
            navigate('/game');
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

    // helper to detect if content is a single emoji
    const isEmoji = (str) => /\p{Emoji}/u.test(str);

    return (
        <div
            ref={disabled ? null : tilt}
            {...rest}
            id={id}
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(); }}
            className={`relative group cursor-pointer ${className}`}
        >
            {/* Gradient border wrapper */}
            <div className={`
                absolute inset-0 rounded-2xl
                p-[2px] w-full h-full
                bg-transparent
                ${!disabled && 'group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:via-blue-500 group-hover:to-sky-600 group-hover:bg-[length:200%_200%] group-hover:animate-[borderGlow_6s_linear_infinite]'}
                transition-all duration-300
            `}></div>

            {/* Inner card */}
            <div
                className={`
                    relative rounded-2xl p-6 w-full h-full
                    bg-white/75 backdrop-blur-md shadow-[0_8px_20px_rgba(0,120,255,0.4)]
                    transition-all duration-300
                    ${!disabled && 'group-hover:bg-white/90 group-hover:shadow-[0_0_10px_rgba(0,180,255,0.6),0_0_20px_rgba(0,120,255,0.4),0_0_30px_rgba(0,120,255,0.25)] transform group-hover:-translate-y-2 group-hover:scale-105'}
                    ${isLoading ? 'opacity-50' : 'opacity-100'}
                `}
            >
                {showRocket && (
                    <img
                        src={talkyRocket}
                        alt="talky rocket"
                        className="block max-w-[64px] w-full h-auto object-contain rounded-md mx-auto"
                    />
                )}
                <h3 className={titleClass || "mt-3 text-lg font-semibold text-center text-slate-900"}>
                    {name || '\u00A0'}
                </h3>
                <p className="text-sm text-slate-700 text-center">{description}</p>

                {/* emoji content */}
                {content && (
                    <p className={`mt-2 text-center ${isEmoji(content) ? 'text-4xl' : 'text-xs'} select-none`}>
                        {content}
                    </p>
                )}
            </div>
        </div>
    )
}

export default Card;

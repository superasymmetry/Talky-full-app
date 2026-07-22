import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import VanillaTilt from 'vanilla-tilt';
import talkyRocket from './assets/logo.png';
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
        dark = false,
        name = '',
        description,
        content,
        onActivate,
        'data-testid': dataTestId,
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
        if (disabled) return;

        // When a caller supplies onActivate, Card acts as a generic
        // clickable/keyboard-activatable surface rather than a nav link -
        // e.g. the sound bank tiles "activate" by speaking a word instead
        // of navigating anywhere. This keeps Card as the single interactive
        // element (one tab stop, one Enter/Space handler) instead of a
        // parent wrapping it in its own role="button" div.
        if (typeof onActivate === 'function') {
            onActivate();
            return;
        }

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

    // helper to detect if content is a single emoji
    const isEmoji = (str) => /\p{Emoji}/u.test(str);

    return (
        <div
            ref={disabled ? null : tilt}
            {...rest}
            id={id}
            data-testid={dataTestId}
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick();
                }
            }}
            className={`relative group cursor-pointer ${className}`}
        >
            {/* Gradient border wrapper */}
            <div className={`
                absolute inset-0 rounded-2xl
                p-[2px] w-full h-full
                bg-transparent
                ${!disabled && (dark
                    ? 'group-hover:bg-gradient-to-r group-hover:from-[#f5a962] group-hover:via-[#ef7a5f] group-hover:to-[#f5a962] group-hover:bg-[length:200%_200%] group-hover:animate-[borderGlow_6s_linear_infinite]'
                    : 'group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:via-blue-500 group-hover:to-sky-600 group-hover:bg-[length:200%_200%] group-hover:animate-[borderGlow_6s_linear_infinite]')}
                transition-all duration-300
            `}></div>

            {/* Inner card */}
            <div
                className={`
                    relative rounded-2xl p-6 w-full h-full
                    backdrop-blur-md transition-all duration-300
                    ${dark
                        ? `bg-[rgba(23,28,58,0.75)] shadow-[0_8px_20px_rgba(0,0,0,0.45)]
                           ${!disabled && 'group-hover:bg-[rgba(23,28,58,0.92)] group-hover:shadow-[0_0_10px_rgba(245,169,98,0.5),0_0_20px_rgba(245,169,98,0.3),0_0_30px_rgba(245,169,98,0.2)] transform group-hover:-translate-y-2 group-hover:scale-105'}`
                        : `bg-white/75 shadow-[0_8px_20px_rgba(0,120,255,0.4)]
                           ${!disabled && 'group-hover:bg-white/90 group-hover:shadow-[0_0_10px_rgba(0,180,255,0.6),0_0_20px_rgba(0,120,255,0.4),0_0_30px_rgba(0,120,255,0.25)] transform group-hover:-translate-y-2 group-hover:scale-105'}`
                    }
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
                <h3 className={titleClass || `mt-3 text-lg font-semibold text-center ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {name || '\u00A0'}
                </h3>
                <p className={`text-sm text-center ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{description}</p>

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

Card.propTypes = {
    disabled: PropTypes.bool,
    options: PropTypes.object,
    to: PropTypes.string,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    className: PropTypes.string,
    titleClass: PropTypes.string,
    noNavigate: PropTypes.bool,
    showRocket: PropTypes.bool,
    isLoading: PropTypes.bool,
    dark: PropTypes.bool,
    name: PropTypes.string,
    description: PropTypes.node,
    content: PropTypes.string,
    onActivate: PropTypes.func,
    'data-testid': PropTypes.string,
};

export default Card;
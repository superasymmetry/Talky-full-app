import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import VanillaTilt from 'vanilla-tilt';
import talkyRocket from './assets/logo.png';
import { useNavigate } from 'react-router-dom';
// Chamfered corners + the n-7 card fill, shared with the Statistics dashboard.
import './Statistics/Statistics.css';

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
        // Every card now uses the one Statistics surface (n-7 + hairline edge),
        // so there's no light/dark split any more. Still destructured so it
        // doesn't land in `rest` and get spread onto the DOM node.
        // eslint-disable-next-line no-unused-vars
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
            className={`
                cut-card p-6 cursor-pointer transition-colors duration-300
                ${!disabled && 'cut-card-interactive'}
                ${isLoading ? 'opacity-50' : 'opacity-100'}
                ${className}
            `}
        >
            {showRocket && (
                <img
                    src={talkyRocket}
                    alt="talky rocket"
                    className="block max-w-[64px] w-full h-auto object-contain mx-auto"
                />
            )}
            <h3 className={titleClass || 'mt-3 text-lg font-semibold text-center text-n-1'}>
                {name || '\u00A0'}
            </h3>
            <p className="text-sm text-center text-n-3">{description}</p>

            {/* emoji content */}
            {content && (
                <p className={`mt-2 text-center ${isEmoji(content) ? 'text-4xl' : 'text-xs'} select-none`}>
                    {content}
                </p>
            )}
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
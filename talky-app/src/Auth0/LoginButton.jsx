import React from 'react'
import { useAuth0 } from '@auth0/auth0-react';
import styles from "../Header/Header.module.css";

const LoginButton = () => {
    const { loginWithRedirect, isAuthenticated } = useAuth0();

    return (
        !isAuthenticated && (
            <button type="button" className={styles.navLink} onClick={() => loginWithRedirect()}>
                Sign In
            </button>
        )
    )
}

export default LoginButton
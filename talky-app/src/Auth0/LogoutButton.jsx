import React from 'react'
import { useAuth0 } from '@auth0/auth0-react';
import styles from "../Header/Header.module.css";

const LogoutButton = () => {
    const { logout, isAuthenticated } = useAuth0();

    return (
        isAuthenticated && (
            <button type="button" className={styles.navLink} onClick={() => logout()}>
                Sign Out
            </button>
        )
    )
}

export default LogoutButton
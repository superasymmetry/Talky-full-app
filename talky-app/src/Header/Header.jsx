import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import talkyLogo from "../assets/talky.png";
import LoginButton from "../Auth0/LoginButton";
import LogoutButton from "../Auth0/LogoutButton";

function Header() {
  const headerRef = useRef(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const setHeightVar = () => {
      document.documentElement.style.setProperty(
        '--header-height',
        `${el.offsetHeight}px`
      );
    };

    setHeightVar();
    const observer = new ResizeObserver(setHeightVar);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={headerRef} className={styles.header}>
      <Link to="/app">
        <img src={talkyLogo} alt="Talky logo" className={styles.logo} />
      </Link>

      <nav className={styles.nav}>
        <ul className={styles.navList}>
          <li className={styles.navItem}>
            <Link to="/app" className={styles.navLink}>Home</Link>
          </li>
          <li className={styles.navItem}>
            <Link to="/voice-settings" className={styles.navLink}>Voice Settings</Link>
          </li>
          <li className={styles.navItem}>
            <Link to="/statistics" className={styles.navLink}>Statistics</Link>
          </li>
          <li className={styles.navItem}>
            <Link to="/profile" className={styles.navLink}>Profile</Link>
          </li>
          <li className={styles.navItem}>
            <LoginButton />
            <LogoutButton />
          </li>
        </ul>
      </nav>
    </header>
  );
}

export default Header;
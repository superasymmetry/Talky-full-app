import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import talkyLogo from "../assets/talky.png";
import LoginButton from "../Auth0/LoginButton";
import LogoutButton from "../Auth0/LogoutButton";
import { VIEW_MODES, useViewMode } from "../viewMode/viewMode.js";

function Header() {
  const headerRef = useRef(null);
  const [viewMode, setViewMode] = useViewMode();
  const isTeacher = viewMode === VIEW_MODES.TEACHER;

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
      <Link to="/app" className={styles.logoLink}>
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
        </ul>
      </nav>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.viewToggle}
          onClick={() => setViewMode(isTeacher ? VIEW_MODES.STUDENT : VIEW_MODES.TEACHER)}
          aria-label={`Switch to ${isTeacher ? 'kid' : 'teacher'} view`}
          title={`Switch to ${isTeacher ? 'kid' : 'teacher'} view`}
        >
          {isTeacher ? '🧑‍🏫 Teacher' : '⭐ Kid'}
        </button>
        <LoginButton />
        <LogoutButton />
      </div>
    </header>
  );
}

export default Header;
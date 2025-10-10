import styles from "./Header.module.css";
import talkyLogo from "../assets/talky.png";

import LoginButton from "../Auth0/LoginButton";
import LogoutButton from "../Auth0/LogoutButton";

function Header() {
  return (
    <header className={styles.header}>
      <a href="#">
        <img src={talkyLogo} alt="Talky logo" className={styles.logo} />
      </a>

      <nav className={styles.nav}>
        <ul className={styles.navList}>
          <li className={styles.navItem}>
            <a href="#" className={styles.navLink}>Home</a>
          </li>
          <li className={styles.navItem}>
            <a href="#" className={styles.navLink}>Products</a>
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

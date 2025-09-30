import styles from "./Header.module.css";
import talkyLogo from "../assets/talky.png";

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
            <a href="#" className={styles.navLink}>Login</a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

export default Header;

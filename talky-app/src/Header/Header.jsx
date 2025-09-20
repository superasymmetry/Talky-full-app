import styles from "./Header.module.css";

function Header() {
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>Talky</h1>
            <nav className={styles.nav}>
                <ul className={styles.navList}>
                    <li className={styles.navItem}><a href="#" className={styles.navLink}>Home</a></li>
                    <li className={styles.navItem}><a href="#" className={styles.navLink}>Products</a></li>
                    <li className={styles.navItem}><a href="#" className={styles.navLink}>Login</a></li>
                </ul>
            </nav>
        </header>
    ); 

}

export default Header 
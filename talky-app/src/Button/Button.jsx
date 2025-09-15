import styles from './Button.module.css'

function Button() {
    const handleClick = (e) => {
        console.log('Button clicked!', e);
    }

    return (
        <button className={styles.button} onClick={(e) => handleClick(e)}>Click Me</button>
    )
}

export default Button
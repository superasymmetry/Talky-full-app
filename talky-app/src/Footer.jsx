function Footer() {
    // Same surface treatment as the Statistics cards: n-8 fill, a hairline
    // n-1/10 edge, and the muted n-3/n-4 text scale — no gradient, no shadow.
    return (
        <footer className="w-full bg-n-8 border-t border-n-1/10 mt-auto">
            <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-4">
                <span className="tagline text-n-3">Talky</span>
                <span className="caption text-n-4">&copy; {new Date().getFullYear()}</span>
            </div>
        </footer>
    );
}

export default Footer;
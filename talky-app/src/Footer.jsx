function Footer() {
    return (
        <footer className="fixed bottom-0 left-0 w-full bg-gradient-to-r from-blue-400 to-purple-500 text-white shadow-lg">
            <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-4">
                <span className="font-extrabold text-xl tracking-tight">Talky</span>
                <span className="text-sm">&copy; {new Date().getFullYear()}</span>
            </div>
        </footer>
    );
}

export default Footer;
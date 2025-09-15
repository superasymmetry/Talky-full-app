function Solutions() {
    const [sol, setSol] = useState("main app");

    return (
        <div>
            <h1>Solutions Page</h1>
            <p>{sol}</p>
        </div>
    )
}

export default Solutions
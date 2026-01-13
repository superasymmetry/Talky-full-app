import { useEffect, useState } from 'react';
import { LineChart, BarChart, RadialGauge } from 'reaviz';
import Header from '../Header/Header.jsx';
import Footer from '../Footer.jsx';

export default function Statistics(){
    const [data, setData] = useState([]);
    const [barData, setBarData] = useState([]);
    const [phonemes, setPhonemes] = useState([]);
    const [levelData, setLevelData] = useState([{key: 'level', data: 0}]);
    const [selectedPhoneme, setSelectedPhoneme] = useState('');
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

    useEffect(() => {
        const userId = localStorage.getItem('userId') || 'demo';
        console.log("userid", userId);
        fetch(`${API_BASE}/api/user/progress?user_id=${encodeURIComponent(userId)}`)
            .then(r => r.json())
            .then(d => {
                const scores = d.phonemeScores || [];
                // extract unique phonemes
                const uniquePhonemes = [...new Set(scores.map(s => s.phoneme))];
                setPhonemes(uniquePhonemes);
                if (uniquePhonemes.length > 0 && !selectedPhoneme) {
                    setSelectedPhoneme(uniquePhonemes[0]);
                }
                // bar chart data: avgScore per phoneme
                const barChartData = scores.map(s => ({
                    key: s.phoneme,
                    data: s.avgScore ?? 0
                }));
                setBarData(barChartData);
            })
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        const userId = localStorage.getItem('userId') || 'demo';
        fetch(`${API_BASE}/api/user/get_level?user_id=${encodeURIComponent(userId)}`)
            .then(r => r.json())
            .then(d => {
                console.log("User level data:", d);
                const parsed = typeof d === 'string' ? JSON.parse(d) : d;
                const points = parsed.level?.subpoints ?? 0;
                setLevelData([{key: 'level', data: points}]);
            })
            .catch(err => console.error(err));
    }, []);
        
    useEffect(() => {
        if (!selectedPhoneme) return;
        const userId = localStorage.getItem('userId') || 'demo';
        fetch(`${API_BASE}/api/user/progress?user_id=${encodeURIComponent(userId)}`)
            .then(r => r.json())
            .then(d => {
                const scores = d.phonemeScores || [];
                const filtered = scores.filter(s => s.phoneme === selectedPhoneme);
                const last14 = filtered.slice(-14);
                const filled = [...Array(14 - last14.length).fill(null), ...last14];
                const chartData = filled.map((item, i) => ({
                    key: i,
                    data: item?.avgScore ?? 1
                }));
                console.log(chartData);
                setData(chartData);
            })
            .catch(err => console.error(err));
    }, [selectedPhoneme]);

    return (
        <div style={{ position: 'fixed', inset: 0, flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <Header />
            <div style={{ 
                flex: 1, 
                height: '100vh',
                display: 'flex',
                padding: '130px',
                overflow: 'hidden',
                boxSizing: 'border-box',
                gap: 32,
                alignItems: 'flex-start'
            }}>
                {/* Left column - smaller charts */}
                <div style={{ 
                    flex: '0 0 400px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 32
                }}>
                    {/* Level gauge */}
                    <div style={{
                        padding: 12,
                        borderRadius: 16,
                        background: 'rgba(255, 255, 255, 0.9)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <h2 style={{ 
                            margin: '0 0 8px 0',
                            fontSize: '1.5rem',
                            background: 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontWeight: 700
                        }}>
                            Current Level
                        </h2>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <RadialGauge height={200} width={200} data={levelData} />
                        </div>
                    </div>

                    {/* Average Score per Phoneme */}
                    <div style={{
                        padding: 24,
                        borderRadius: 16,
                        background: 'rgba(255, 255, 255, 0.9)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        <h2 style={{ 
                            margin: '0 0 16px 0',
                            fontSize: '1.5rem',
                            background: 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontWeight: 700
                        }}>
                            Average Score per Phoneme
                        </h2>
                        <BarChart width={350} height={250} data={barData} />
                    </div>
                </div>

                {/* Right column - main chart */}
                <div style={{ 
                    flex: 1,
                    padding: 24,
                    borderRadius: 16,
                    background: 'rgba(255, 255, 255, 0.9)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <h2 style={{ 
                        margin: '0 0 16px 0',
                        fontSize: '2rem',
                        background: 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontWeight: 700
                    }}>
                        Phoneme Score Progress (Last 14)
                    </h2>
                    <select
                        value={selectedPhoneme}
                        onChange={(e) => setSelectedPhoneme(e.target.value)}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'linear-gradient(90deg, #6dd3ff 0%, #6b73ff 100%)',
                            color: 'white',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginBottom: 24,
                            minWidth: 200,
                            fontSize: '1rem',
                            boxShadow: '0 4px 12px rgba(107, 115, 255, 0.3)'
                        }}
                    >
                        {phonemes.map(p => (
                            <option key={p} value={p} style={{ background: 'white', color: '#333' }}>
                                {p}
                            </option>
                        ))}
                    </select>
                    <LineChart width={700} height={470} data={data} />
                </div>
            </div>
            <Footer />
        </div>
    );
};
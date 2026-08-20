import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: 24, textAlign: 'center',
    }}>
      <h1>Page not found</h1>
      <p>We couldn't find what you're looking for.</p>
      <Link to="/">Back to home</Link>
    </div>
  );
}

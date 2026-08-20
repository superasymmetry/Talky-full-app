import { useMemo, useState } from 'react';
import { Card } from './components.jsx';
import Header from '../Header/Header.jsx';
import StatisticsPanel from './StatisticsPanel.jsx';
import { useAuth0 } from '@auth0/auth0-react';
import { makeAuthFetch } from '../utils/authFetch.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const Layout = ({ children }) => (
  <div className="bg-n-8 text-n-1 min-h-screen">
    <Header />
    <main
      className="px-5 lg:px-10 pb-12"
      style={{ paddingTop: 'calc(var(--header-height, 112px) + 1.5rem)' }}
    >
      <div className="max-w-[87.5rem] mx-auto flex flex-col gap-4">{children}</div>
    </main>
  </div>
);

export default function Statistics() {
  const { user, isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const authFetch = useMemo(() => makeAuthFetch(getAccessTokenSilently), [getAccessTokenSilently]);
  const [downloading, setDownloading] = useState(null);

  if (authLoading) {
    return <Layout><Card>Loading statistics…</Card></Layout>;
  }
  if (!isAuthenticated || !user) {
    return <Layout><Card>Please log in to view your statistics.</Card></Layout>;
  }

  const userId = user.sub || user.email;

  const handleDownloadReport = async (format) => {
    setDownloading(format);
    try {
      const res = await authFetch(`${API_BASE}/api/user/student/${userId}/report.${format}`);
      if (!res.ok) throw new Error(`Report download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `talky-progress-${userId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report', err);
      alert('Could not download the report — please try again.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleDownloadReport('pdf')}
          disabled={downloading === 'pdf'}
          className="cut-chip px-3 py-1.5 text-sm bg-n-6 text-n-2 border border-n-1/10 hover:border-color-1/60"
        >
          {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
        </button>
        <button
          type="button"
          onClick={() => handleDownloadReport('csv')}
          disabled={downloading === 'csv'}
          className="cut-chip px-3 py-1.5 text-sm bg-n-6 text-n-2 border border-n-1/10 hover:border-color-1/60"
        >
          {downloading === 'csv' ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>
      <StatisticsPanel userId={userId} />
    </Layout>
  );
}

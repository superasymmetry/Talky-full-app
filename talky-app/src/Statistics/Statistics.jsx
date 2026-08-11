import { Card } from './components.jsx';
import Header from '../Header/Header.jsx';
import StatisticsPanel from './StatisticsPanel.jsx';
import { useAuth0 } from '@auth0/auth0-react';

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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth0();

  if (authLoading) {
    return <Layout><Card>Loading statistics…</Card></Layout>;
  }
  if (!isAuthenticated || !user) {
    return <Layout><Card>Please log in to view your statistics.</Card></Layout>;
  }

  const userId = user.sub || user.email;

  return (
    <Layout>
      <StatisticsPanel userId={userId} />
    </Layout>
  );
}

import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError, type Catalog, type Me, type Project } from './api';
import { Nebula, ToastProvider } from './components/ui';
import { AuthPage } from './pages/Auth';
import { Layout } from './pages/Layout';
import { AppProvider } from './state';

type Boot = { status: 'loading' } | { status: 'anonymous' } | { status: 'ready'; me: Me; catalog: Catalog; projects: Project[] } | { status: 'error'; message: string };

function App() {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const [me, catalog, projects] = await Promise.all([api<Me>('/me'), api<Catalog>('/catalog'), api<Project[]>('/projects')]);
      setBoot({ status: 'ready', me, catalog, projects });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setBoot({ status: 'anonymous' });
      else setBoot({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setMe = useCallback((me: Me) => setBoot((b) => (b.status === 'ready' ? { ...b, me } : b)), []);

  if (boot.status === 'loading') return <div className="auth-wrap"><Nebula className="mark" /></div>;
  if (boot.status === 'anonymous' || (boot.status === 'ready' && location.hash.startsWith('#/reset'))) return <AuthPage onDone={load} />;
  if (boot.status === 'error') return <div className="auth-wrap"><div className="notice notice-danger">{boot.message}</div></div>;
  return (
    <AppProvider me={boot.me} catalog={boot.catalog} initialProjects={boot.projects} onMe={setMe}>
      <Layout onSignOut={() => setBoot({ status: 'anonymous' })} />
    </AppProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);

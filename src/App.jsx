import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AuthScreen from './pages/AuthScreen';
import AppShell from './layout/AppShell';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  const { isAuthenticated, checking } = useAuth();

  useEffect(() => {
    const onAuthScreen = !checking && !isAuthenticated;
    document.documentElement.classList.toggle('auth-route', onAuthScreen);
    document.body.classList.toggle('auth-route', onAuthScreen);
  }, [checking, isAuthenticated]);

  if (checking) {
    return (
      <div className="app-boot">
        <div className="app-boot-card">
          <span className="app-logo-mark app-logo-mark--lg">P</span>
          <p>Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <AuthScreen />;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </BrowserRouter>
  );
}

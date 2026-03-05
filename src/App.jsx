import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase'
import { LanguageProvider, useLanguage } from './i18n';
import AuthScreen from './AuthScreen';
import Home from './Home';
import Editor from './Editor';
import './index.css';

function AppContent() {
  const { t } = useLanguage();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="app-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 400 }}>{t('general.loading')}</div>;
  }

  return (
    <BrowserRouter>
      <div className="app-root">
        {!supabase && (
          <div style={{ position: 'absolute', top: 0, width: '100%', background: 'rgba(248,113,113,0.9)', color: 'white', padding: '0.5rem', textAlign: 'center', zIndex: 9999, fontSize: '0.85rem', fontWeight: 500, backdropFilter: 'blur(8px)' }}>
            {t('general.supabaseWarning')}
          </div>
        )}

        <Routes>
          <Route
            path="/auth"
            element={session ? <Navigate to="/" replace /> : <AuthScreen />}
          />
          <Route
            path="/"
            element={session ? <Home /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/space/:id"
            element={session ? <Editor /> : <Navigate to="/auth" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;

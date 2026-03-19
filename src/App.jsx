import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { supabase } from './lib/supabase'
import { LanguageProvider, useLanguage } from './i18n';
import AuthScreen from './AuthScreen';
import DictionaryPage from './DictionaryPage';
import Editor from './Editor';
import ErrorBoundary from './ErrorBoundary';
import { getSpacePath, resolveSpaceRouteParams } from './lib/routes';
import './index.css';

function SpaceModeRedirect() {
  const { id } = useParams();
  return <Navigate to={getSpacePath(id)} replace />;
}

function DictionaryRedirect() {
  return <Navigate to="/d" replace />;
}

function SpaceRouteResolver() {
  const params = useParams();
  const location = useLocation();
  const { spaceId, mode, isCanonical } = resolveSpaceRouteParams(params);

  if (!spaceId) {
    return <Navigate to="/" replace />;
  }

  const canonicalPath = getSpacePath(spaceId, mode);
  if (!isCanonical || location.pathname !== canonicalPath) {
    return <Navigate to={canonicalPath} replace />;
  }

  return <ErrorBoundary><Editor /></ErrorBoundary>;
}

function AppContent() {
  const { t } = useLanguage();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));

  useEffect(() => {
    if (!supabase) return undefined;

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
            element={session ? <ErrorBoundary><Editor /></ErrorBoundary> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/s/:id"
            element={session ? <SpaceModeRedirect /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/s/:first/:second"
            element={session ? <SpaceRouteResolver /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/S/:id"
            element={session ? <SpaceModeRedirect /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/S/:first/:second"
            element={session ? <SpaceRouteResolver /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/space/:id"
            element={session ? <SpaceModeRedirect /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/space/:first/:second"
            element={session ? <SpaceRouteResolver /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/d"
            element={session ? <ErrorBoundary><DictionaryPage /></ErrorBoundary> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/d/:id"
            element={session ? <DictionaryRedirect /> : <Navigate to="/auth" replace />}
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

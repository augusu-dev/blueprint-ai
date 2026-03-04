import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase'
import AuthScreen from './AuthScreen';
import Home from './Home';
import Editor from './Editor';
import './index.css';

function App() {
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
    return <div className="app-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <div className="app-root">
        {!supabase && (
          <div style={{ position: 'absolute', top: 0, width: '100%', background: 'red', color: 'white', padding: '0.5rem', textAlign: 'center', zIndex: 9999 }}>
            Warning: Supabase credentials are missing. Check .env.local file.
          </div>
        )}

        <Routes>
          {/* Public/Auth Route */}
          <Route
            path="/auth"
            element={session ? <Navigate to="/" replace /> : <AuthScreen />}
          />

          {/* Protected Routes */}
          <Route
            path="/"
            element={session ? <Home /> : <Navigate to="/auth" replace />}
          />
          <Route
            path="/space/:id"
            element={session ? <Editor /> : <Navigate to="/auth" replace />}
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

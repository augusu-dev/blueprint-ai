import { useState, useEffect } from 'react';
import supabase from './lib/supabase';
import AuthScreen from './AuthScreen';
import Editor from './Editor';
import './index.css';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="app-root">
      {!supabase && (
        <div style={{ position: 'absolute', top: 0, width: '100%', background: 'red', color: 'white', padding: '0.5rem', textAlign: 'center', zIndex: 9999 }}>
          Warning: Supabase credentials are missing. Check .env.local file.
        </div>
      )}
      {session ? (
        <Editor />
      ) : (
        <AuthScreen />
      )}
    </div>
  );
}

export default App;

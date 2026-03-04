import { useState } from 'react';
import { supabase } from './lib/supabase';

export default function AuthScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleAuth = async (isSignUp) => {
        if (!supabase) {
            setMessage("Error: Supabase is not configured. Please add keys to .env.local");
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            const { error } = isSignUp
                ? await supabase.auth.signUp({ email, password })
                : await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                setMessage(error.message);
            } else if (isSignUp) {
                setMessage('Check your email for the confirmation link!');
            }
        } catch (err) {
            setMessage('An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card glass-panel">
                <div className="auth-header">
                    <h2>Blueprint AI</h2>
                    <p>Login to start building your AI workflows</p>
                </div>
                <div className="auth-form">
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {message && <p style={{ color: 'var(--node-branch)', fontSize: '0.8rem', marginBottom: '1rem' }}>{message}</p>}

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => handleAuth(false)}
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : 'Sign In'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => handleAuth(true)}
                            disabled={loading}
                            style={{ flex: 1 }}
                        >
                            Sign Up
                        </button>
                    </div>
                </div>
                <div className="auth-footer">
                    <p>Powered by Supabase Auth</p>
                </div>
            </div>
        </div>
    );
}

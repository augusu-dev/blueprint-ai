import { useState } from 'react';
import { supabase } from './lib/supabase';
import { useLanguage } from './i18n';

export default function AuthScreen() {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleAuth = async (isSignUp) => {
        if (!supabase) {
            setMessage(t('auth.noSupabase'));
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
                setMessage(t('auth.checkEmail'));
            }
        } catch (err) {
            setMessage(t('auth.unexpectedError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Ambient glow */}
            <div style={{
                position: 'absolute', top: '-15%', left: '20%', width: '40%', height: '40%',
                background: 'radial-gradient(circle, rgba(92, 124, 250, 0.15) 0%, transparent 60%)',
                filter: 'blur(80px)', zIndex: 0
            }} />
            <div style={{
                position: 'absolute', bottom: '-15%', right: '20%', width: '40%', height: '40%',
                background: 'radial-gradient(circle, rgba(32, 201, 151, 0.1) 0%, transparent 60%)',
                filter: 'blur(80px)', zIndex: 0
            }} />
            <div className="auth-card glass-panel" style={{ position: 'relative', zIndex: 1 }}>
                <div className="auth-header">
                    <h2 style={{
                        background: 'linear-gradient(135deg, #ffffff 0%, #b8c6dc 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.02em',
                        fontSize: '1.6rem',
                        fontWeight: 700
                    }}>{t('auth.title')}</h2>
                    <p style={{ marginTop: '0.4rem' }}>{t('auth.subtitle')}</p>
                </div>
                <div className="auth-form">
                    <div className="form-group">
                        <label>{t('auth.email')}</label>
                        <input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('auth.password')}</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {message && <p style={{ color: '#f472b6', fontSize: '0.8rem', marginBottom: '1rem' }}>{message}</p>}

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => handleAuth(false)}
                            disabled={loading}
                        >
                            {loading ? t('auth.processing') : t('auth.signIn')}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => handleAuth(true)}
                            disabled={loading}
                            style={{ flex: 1 }}
                        >
                            {t('auth.signUp')}
                        </button>
                    </div>
                </div>
                <div className="auth-footer">
                    <p>{t('auth.footer')}</p>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { useLanguage } from './i18n';
import { Mail, Lock, ArrowRight, Sparkles, UserPlus } from 'lucide-react';

export default function AuthScreen() {
    const { t } = useLanguage();
    const openAiOidcProvider = import.meta.env.VITE_OPENAI_OIDC_PROVIDER || 'custom:openai';
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [orbPos, setOrbPos] = useState({ x: 50, y: 50 });

    useEffect(() => {
        const interval = setInterval(() => {
            setOrbPos({
                x: 30 + Math.random() * 40,
                y: 30 + Math.random() * 40
            });
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleAuth = async (e) => {
        e.preventDefault();
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

    const handleOpenAiAuth = async () => {
        if (!supabase) {
            setMessage(t('auth.noSupabase'));
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: openAiOidcProvider,
                options: {
                    redirectTo: window.location.origin,
                    scopes: 'openid profile email',
                },
            });

            if (error) {
                if (error.code === 'oauth_provider_not_supported' || error.code === 'provider_disabled') {
                    setMessage('OpenAI login requires a custom OIDC provider to be configured in Supabase.');
                } else {
                    setMessage(error.message);
                }
            }
        } catch (err) {
            setMessage('OpenAI login could not be started.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-dark)', position: 'relative', overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            {/* Animated Ambient Backgrounds */}
            <div style={{
                position: 'absolute', top: `${orbPos.y - 40}%`, left: `${orbPos.x - 40}%`,
                width: '80%', height: '80%',
                background: 'radial-gradient(circle, rgba(92, 124, 250, 0.12) 0%, transparent 60%)',
                filter: 'blur(80px)', zIndex: 0, transition: 'all 5s ease-in-out'
            }} />
            <div style={{
                position: 'absolute', bottom: `${100 - orbPos.y - 30}%`, right: `${100 - orbPos.x - 30}%`,
                width: '60%', height: '60%',
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.08) 0%, transparent 60%)',
                filter: 'blur(80px)', zIndex: 0, transition: 'all 6s ease-in-out'
            }} />

            {/* Main Auth Card */}
            <div className="glass-panel" style={{
                position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px',
                padding: '2.5rem', borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',
                animation: 'fadeSlideUp 0.6s ease-out forwards',
                background: 'rgba(15, 15, 20, 0.65)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '16px',
                        background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.25rem',
                        boxShadow: '0 8px 16px rgba(92, 124, 250, 0.25)',
                        animation: 'pulse 3s infinite'
                    }}>
                        <Sparkles color="white" size={24} />
                    </div>
                    <h2 style={{
                        background: 'linear-gradient(135deg, #ffffff 0%, #a0aec0 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        fontSize: '1.75rem', fontWeight: 700, margin: 0, letterSpacing: '-0.03em'
                    }}>
                        {isSignUp ? t('auth.signUpTitle') : t('auth.title')}
                    </h2>
                    <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {isSignUp ? t('auth.signUpSubtitle') : t('auth.subtitle')}
                    </p>
                </div>

                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={handleOpenAiAuth}
                        style={{
                            width: '100%', padding: '0.85rem',
                            background: 'rgba(255,255,255,0.04)',
                            color: 'var(--text-main)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px',
                            fontSize: '0.95rem', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = 'rgba(92, 124, 250, 0.45)'; }}
                        onMouseLeave={(e) => { if (!loading) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    >
                        <Sparkles size={18} />
                        Continue with OpenAI
                    </button>

                    <div style={{
                        marginTop: '-0.45rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                    }}>
                        This signs into Blueprint with an OpenAI account when a Supabase custom OIDC provider is configured.
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                            {t('auth.email')}
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={{
                                    width: '100%', padding: '0.8rem 1rem 0.8rem 2.8rem',
                                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '12px', color: 'var(--text-main)', fontSize: '0.95rem',
                                    transition: 'all 0.2s', outline: 'none'
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--primary)';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(92, 124, 250, 0.15)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(255,255,255,0.08)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                            {t('auth.password')}
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={{
                                    width: '100%', padding: '0.8rem 1rem 0.8rem 2.8rem',
                                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '12px', color: 'var(--text-main)', fontSize: '0.95rem',
                                    transition: 'all 0.2s', outline: 'none'
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--primary)';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(92, 124, 250, 0.15)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(255,255,255,0.08)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        </div>
                    </div>

                    {message && (
                        <div style={{
                            padding: '0.75rem 1rem', borderRadius: '12px', fontSize: '0.85rem',
                            background: message.includes('@') ? 'rgba(52, 211, 153, 0.1)' : 'rgba(244, 114, 182, 0.1)',
                            color: message.includes('@') ? '#34d399' : '#f472b6',
                            border: `1px solid ${message.includes('@') ? 'rgba(52, 211, 153, 0.2)' : 'rgba(244, 114, 182, 0.2)'}`,
                            animation: 'fadeIn 0.3s'
                        }}>
                            {message}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%', padding: '0.85rem', marginTop: '0.5rem',
                            background: 'linear-gradient(135deg, var(--primary) 0%, #748ffc 100%)',
                            color: 'white', border: 'none', borderRadius: '12px',
                            fontSize: '1rem', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(92, 124, 250, 0.3)',
                            opacity: loading ? 0.7 : 1
                        }}
                        onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(92, 124, 250, 0.4)'; } }}
                        onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(92, 124, 250, 0.3)'; } }}
                    >
                        {loading ? t('auth.processing') : isSignUp ? (
                            <><UserPlus size={18} /> {t('auth.signUpBtn')}</>
                        ) : (
                            <>{t('auth.signIn')} <ArrowRight size={18} /></>
                        )}
                    </button>
                </form>

                {isSignUp && (
                    <div style={{
                        marginTop: '1.25rem', padding: '0.85rem', borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.03)', border: '1px dashed rgba(255, 255, 255, 0.1)',
                        textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)'
                    }}>
                        {t('auth.sutejpHint')} <a href="https://sute.jp/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 500, textDecoration: 'none' }}>{t('auth.sutejpLink')}</a>
                    </div>
                )}

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {isSignUp ? t('auth.alreadyHaveAccount') : t('auth.needAccount')}{' '}
                        <button
                            onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}
                            style={{
                                background: 'none', border: 'none', padding: 0,
                                color: 'var(--primary)', fontWeight: 600, cursor: 'pointer',
                                fontSize: '0.85rem', transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.color = '#748ffc'}
                            onMouseLeave={(e) => e.target.style.color = 'var(--primary)'}
                        >
                            {isSignUp ? t('auth.switchToSignIn') : t('auth.switchToSignUp')}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}

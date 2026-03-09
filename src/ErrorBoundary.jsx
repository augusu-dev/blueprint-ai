import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('UI boundary caught an error:', error, errorInfo);
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div style={{
                minHeight: '100vh',
                width: '100%',
                background: 'var(--bg-dark, #0b1020)',
                color: 'var(--text-main, #f8fafc)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
            }}>
                <div style={{
                    width: 'min(560px, 100%)',
                    borderRadius: '24px',
                    padding: '1.5rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
                }}>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#93c5fd', marginBottom: '0.5rem' }}>
                        Session Error
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>This view crashed before it could render.</h2>
                    <p style={{ margin: '0.8rem 0 0', color: 'rgba(255,255,255,0.72)', lineHeight: 1.6 }}>
                        The app caught the error instead of leaving a blank screen. Reload the page or go back to the home screen.
                    </p>
                    {this.state.error?.message && (
                        <pre style={{
                            marginTop: '1rem',
                            padding: '0.9rem',
                            borderRadius: '16px',
                            background: 'rgba(15,23,42,0.7)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: '#fda4af',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: '0.8rem',
                            fontFamily: 'Consolas, monospace',
                        }}>
                            {this.state.error.message}
                        </pre>
                    )}
                    <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1rem' }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                border: 'none',
                                borderRadius: '999px',
                                padding: '0.65rem 1rem',
                                cursor: 'pointer',
                                background: '#60a5fa',
                                color: '#08111d',
                                fontWeight: 600,
                            }}
                        >
                            Reload
                        </button>
                        <button
                            onClick={() => { window.location.href = '/'; }}
                            style={{
                                borderRadius: '999px',
                                padding: '0.65rem 1rem',
                                cursor: 'pointer',
                                background: 'transparent',
                                color: 'var(--text-main, #f8fafc)',
                                border: '1px solid rgba(255,255,255,0.14)',
                                fontWeight: 600,
                            }}
                        >
                            Back Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Box, LogOut, ChevronRight } from 'lucide-react';
import { useLanguage } from './i18n';

export default function Home() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    const handleNewSpace = async () => {
        const initNodes = [{ id: '1', type: 'sequenceNode', position: { x: 100, y: 100 }, data: { isStarter: true, dir: 'LR', prompt: '' } }];
        try {
            if (supabase) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data, error } = await supabase
                        .from('spaces')
                        .insert([{ user_id: user.id, title: t('editor.untitled'), nodes: initNodes, edges: [] }])
                        .select()
                        .single();

                    if (!error && data) {
                        navigate(`/space/${data.id}`);
                        return;
                    }
                }
            }
        } catch (err) {
            console.error("Failed to create remote space:", err);
        }

        // Fallback for local / unauthenticated
        const newId = crypto.randomUUID();
        const spaceData = { title: t('editor.untitled'), nodes: initNodes, edges: [], updated_at: new Date().toISOString() };
        localStorage.setItem(`blueprint_space_${newId}`, JSON.stringify(spaceData));
        navigate(`/space/${newId}`);
    };

    return (
        <div className="home-layout" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-dark)',
            color: 'var(--text-main)',
            position: 'relative',
            overflow: 'hidden'
        }}>

            {/* Ambient Background Glows */}
            <div style={{
                position: 'absolute', top: '-15%', left: '-5%', width: '35%', height: '35%',
                background: 'radial-gradient(circle, rgba(108, 140, 255, 0.1) 0%, transparent 70%)',
                filter: 'blur(80px)', zIndex: 0
            }} />
            <div style={{
                position: 'absolute', bottom: '-20%', right: '-5%', width: '50%', height: '50%',
                background: 'radial-gradient(circle, rgba(52, 211, 153, 0.06) 0%, transparent 70%)',
                filter: 'blur(100px)', zIndex: 0
            }} />

            {/* Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.5rem 3rem',
                position: 'relative',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--primary)', padding: '0.45rem', borderRadius: '10px', color: 'white', display: 'flex' }}>
                        <Box size={22} />
                    </div>
                    <h1 style={{
                        margin: 0,
                        fontSize: '1.3rem',
                        fontWeight: 600,
                        background: 'linear-gradient(90deg, #ffffff, #94a3b8)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '0.5px'
                    }}>Blueprint</h1>
                </div>

                <div>
                    <button
                        onClick={() => supabase.auth.signOut()}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--text-muted)',
                            padding: '0.45rem 1rem',
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '0.82rem',
                            fontWeight: 400
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                    >
                        <LogOut size={15} /> {t('home.logout')}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 10
            }}>
                <div style={{
                    maxWidth: '720px',
                    textAlign: 'center',
                    padding: '0 2rem',
                    animation: 'fadeSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <h2 style={{
                        fontSize: '3rem',
                        fontWeight: 700,
                        lineHeight: 1.15,
                        marginBottom: '1.5rem',
                        background: 'linear-gradient(135deg, #ffffff 0%, #7b8ba3 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.02em'
                    }}>
                        {t('home.title')}
                    </h2>

                    <p style={{
                        fontSize: '1.1rem',
                        color: 'var(--text-muted)',
                        marginBottom: '3rem',
                        maxWidth: '580px',
                        margin: '0 auto 3rem auto',
                        lineHeight: 1.7,
                        fontWeight: 400
                    }}>
                        {t('home.subtitle')}
                    </p>

                    <button
                        onClick={handleNewSpace}
                        className="btn btn-primary"
                        style={{
                            padding: '0.9rem 2.5rem',
                            fontSize: '1rem',
                            borderRadius: '28px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 8px 25px rgba(108, 140, 255, 0.3)',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            fontWeight: 500
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 12px 35px rgba(108, 140, 255, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 8px 25px rgba(108, 140, 255, 0.3)';
                        }}
                    >
                        {t('home.newSpace')} <ChevronRight size={18} />
                    </button>
                </div>
            </main>
        </div>
    );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Box, LogOut, ChevronRight } from 'lucide-react';

export default function Home() {
    const navigate = useNavigate();

    const handleNewSpace = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user logged in");

            const { data, error } = await supabase
                .from('spaces')
                .insert([
                    { user_id: user.id, title: 'Untitled Space' }
                ])
                .select()
                .single();

            if (error) throw error;

            navigate(`/space/${data.id}`);
        } catch (err) {
            console.error("Failed to create space:", err);
            // Fallback for development if DB fails
            navigate(`/space/new-${Date.now()}`);
        }
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
                position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%',
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
                filter: 'blur(60px)', zIndex: 0
            }} />
            <div style={{
                position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '60%',
                background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
                filter: 'blur(80px)', zIndex: 0
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
                    <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '12px', color: 'white' }}>
                        <Box size={24} />
                    </div>
                    <h1 style={{
                        margin: 0,
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        background: 'linear-gradient(90deg, #ffffff, #94a3b8)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '1px'
                    }}>Blueprint</h1>
                </div>

                <div>
                    <button
                        onClick={() => supabase.auth.signOut()}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-muted)',
                            padding: '0.5rem 1rem',
                            borderRadius: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '0.85rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                        <LogOut size={16} /> Sign Out
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
                    maxWidth: '800px',
                    textAlign: 'center',
                    padding: '0 2rem'
                }}>
                    <h2 style={{
                        fontSize: '3.5rem',
                        fontWeight: 800,
                        lineHeight: 1.1,
                        marginBottom: '1.5rem',
                        background: 'linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Think clearly.<br />Build visually.
                    </h2>

                    <p style={{
                        fontSize: '1.25rem',
                        color: 'var(--text-muted)',
                        marginBottom: '3rem',
                        maxWidth: '600px',
                        margin: '0 auto 3rem auto',
                        lineHeight: 1.6
                    }}>
                        Blueprint is a node-based interface that replaces linear chat.
                        Design complex flows, swap AI models instantly, and ground your reasoning dynamically.
                    </p>

                    <button
                        onClick={handleNewSpace}
                        className="btn btn-primary"
                        style={{
                            padding: '1rem 2.5rem',
                            fontSize: '1.1rem',
                            borderRadius: '30px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 10px 25px rgba(59, 130, 246, 0.4)',
                            transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 15px 35px rgba(59, 130, 246, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.4)';
                        }}
                    >
                        Create New Space <ChevronRight size={20} />
                    </button>
                </div>
            </main>
        </div>
    );
}

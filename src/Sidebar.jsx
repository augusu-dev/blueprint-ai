import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Plus, Clock, LayoutTemplate } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function Sidebar({ isOpen, onClose }) {
    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const { id: currentSpaceId } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isOpen) return;

        const fetchSpaces = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data, error } = await supabase
                    .from('spaces')
                    .select('id, title, updated_at')
                    .eq('user_id', user.id)
                    .order('updated_at', { ascending: false });

                if (error) throw error;
                setSpaces(data || []);
            } catch (err) {
                console.error("Failed to load spaces", err);
            } finally {
                setLoading(false);
            }
        };

        fetchSpaces();

        const handleTitleUpdate = () => fetchSpaces();
        window.addEventListener('spaceTitleUpdated', handleTitleUpdate);
        return () => window.removeEventListener('spaceTitleUpdated', handleTitleUpdate);
    }, [isOpen]);

    const handleNewSpace = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user logged in");

            const currentSpace = spaces.find(s => s.id === currentSpaceId);
            if (currentSpace && (currentSpace.title === '無題のスペース' || currentSpace.title === 'Untitled Space')) {
                onClose();
                return;
            }

            const { data, error } = await supabase
                .from('spaces')
                .insert([{ user_id: user.id, title: '無題のスペース' }])
                .select()
                .single();

            if (error) throw error;

            navigate(`/space/${data.id}`);
            onClose();
        } catch (err) {
            console.error("Failed to create new space:", err);
        }
    };

    const handleSelectSpace = (id) => {
        navigate(`/space/${id}`);
        onClose();
    };

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 999
                    }}
                />
            )}

            {/* Drawer */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: isOpen ? 0 : '-350px',
                width: '320px',
                height: '100vh',
                background: 'var(--bg-dark)',
                borderRight: '1px solid var(--panel-border)',
                transition: 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isOpen ? '10px 0 30px rgba(0,0,0,0.3)' : 'none'
            }}>

                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--panel-border)'
                }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>ワークスペース</h2>
                    <button onClick={onClose} className="btn-icon" style={{ width: '30px', height: '30px' }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    <button
                        onClick={handleNewSpace}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            marginBottom: '1.5rem',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--primary)'}
                    >
                        <Plus size={18} /> 新規スペース
                    </button>

                    <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', marginLeft: '0.5rem' }}>
                        履歴
                    </h3>

                    {loading ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem', marginTop: '2rem' }}>読み込み中...</p>
                    ) : spaces.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem', marginTop: '2rem' }}>スペースがありません</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {spaces.map(space => (
                                <div
                                    key={space.id}
                                    onClick={() => handleSelectSpace(space.id)}
                                    style={{
                                        padding: '0.75rem 1rem',
                                        borderRadius: '8px',
                                        background: space.id === currentSpaceId ? 'rgba(255,255,255,0.08)' : 'transparent',
                                        border: `1px solid ${space.id === currentSpaceId ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.3rem'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (space.id !== currentSpaceId) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (space.id !== currentSpaceId) e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <LayoutTemplate size={14} color="var(--primary)" />
                                        <span style={{ fontWeight: 500, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {space.title}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem', paddingLeft: '1.2rem' }}>
                                        <Clock size={10} />
                                        <span>{formatDate(space.updated_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

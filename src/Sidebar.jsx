import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from './lib/supabase';
import {
    FolderClosed,
    FolderOpen,
    FolderPlus,
    MessageSquare,
    Pin,
    Plus,
    Search,
    Settings,
    Trash2,
    X,
} from 'lucide-react';
import { useLanguage } from './i18n';
import { DEFAULT_SPACE_MODE, getSpacePath, isSpaceMode } from './lib/routes';
import {
    assignSpaceToProject,
    createWorkspaceProject,
    loadWorkspaceMeta,
    removeSpaceFromWorkspace,
    setDraftProjectId,
    setSelectedProjectId,
    syncWorkspaceProjectFromSpace,
    togglePinnedSpace,
} from './lib/workspace';

function SidebarSpaceRow({
    space,
    currentSpaceId,
    projectName,
    isPinned,
    onOpen,
    onPin,
    onDelete,
}) {
    return (
        <div
            className="sidebar-item"
            onClick={() => onOpen(space.id)}
            style={{
                padding: '0.52rem 0.6rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: space.id === currentSpaceId ? 'linear-gradient(90deg, rgba(92, 124, 250, 0.15) 0%, transparent 100%)' : 'transparent',
                borderLeft: space.id === currentSpaceId ? '3px solid var(--primary)' : '3px solid transparent',
                borderRadius: '0 8px 8px 0',
                cursor: 'pointer',
                marginBottom: '0.24rem',
                transition: 'background 0.2s ease',
            }}
            onMouseEnter={(event) => {
                if (space.id !== currentSpaceId) {
                    event.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                }
            }}
            onMouseLeave={(event) => {
                if (space.id !== currentSpaceId) {
                    event.currentTarget.style.background = 'transparent';
                }
            }}
        >
            <MessageSquare size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.78rem',
                    color: 'var(--text-main)',
                    fontWeight: space.id === currentSpaceId ? 500 : 400,
                }}
                >
                    {space.title}
                </div>
                {projectName && (
                    <div style={{
                        fontSize: '0.68rem',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '0.12rem',
                    }}
                    >
                        {projectName}
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onPin(space.id);
                }}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: isPinned ? '#8ea2ff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.15rem',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                }}
                title={isPinned ? 'ピンを外す' : 'ピンする'}
                aria-label={isPinned ? 'ピンを外す' : 'ピンする'}
            >
                <Pin size={12} fill={isPinned ? 'currentColor' : 'none'} />
            </button>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onDelete(event, space.id);
                }}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.15rem',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                }}
                title="削除"
                aria-label="削除"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}

export default function Sidebar({ isOpen, onClose, onOpenSettings }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { id: currentSpaceId, mode } = useParams();
    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [workspaceMetaVersion, setWorkspaceMetaVersion] = useState(0);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const currentMode = isSpaceMode(mode) ? mode : DEFAULT_SPACE_MODE;
    const workspaceMeta = useMemo(() => {
        void workspaceMetaVersion;
        return loadWorkspaceMeta();
    }, [workspaceMetaVersion]);
    const routeProjectId = currentSpaceId ? (workspaceMeta.spaces[currentSpaceId]?.projectId || null) : null;
    const selectedProjectId = workspaceMeta.selectedProjectId || null;
    const activeProjectIdForDraft = selectedProjectId || routeProjectId || null;

    const fetchSpaces = useCallback(async () => {
        setLoading(true);
        let allSpaces = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key?.startsWith('blueprint_space_')) continue;

            try {
                const spaceData = JSON.parse(localStorage.getItem(key));
                const id = key.replace('blueprint_space_', '');
                allSpaces.push({
                    id,
                    title: spaceData.title || t('editor.untitled'),
                    updated_at: spaceData.updated_at || new Date().toISOString(),
                });
            } catch {
                // Ignore malformed local snapshots.
            }
        }

        if (supabase) {
            try {
                const { data, error } = await supabase.from('spaces').select('id, title, updated_at').order('updated_at', { ascending: false });
                if (!error && data) {
                    data.forEach((remoteSpace) => {
                        const existingIndex = allSpaces.findIndex((space) => space.id === remoteSpace.id);
                        if (existingIndex >= 0) {
                            allSpaces[existingIndex] = remoteSpace;
                        } else {
                            allSpaces.push(remoteSpace);
                        }
                    });
                }
            } catch {
                // Ignore remote fetch failures and keep local data.
            }
        }

        allSpaces.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        setSpaces(allSpaces);
        setLoading(false);
    }, [t]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const timer = window.setTimeout(() => {
            fetchSpaces();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchSpaces, isOpen]);

    useEffect(() => {
        const handleSpaceTitleUpdate = () => {
            fetchSpaces();
        };
        const handleWorkspaceMetaUpdate = () => {
            setWorkspaceMetaVersion((current) => current + 1);
        };
        window.addEventListener('spaceTitleUpdated', handleSpaceTitleUpdate);
        window.addEventListener('workspaceMetaUpdated', handleWorkspaceMetaUpdate);
        return () => {
            window.removeEventListener('spaceTitleUpdated', handleSpaceTitleUpdate);
            window.removeEventListener('workspaceMetaUpdated', handleWorkspaceMetaUpdate);
        };
    }, [fetchSpaces]);

    const handleNewSpace = useCallback(() => {
        setDraftProjectId(activeProjectIdForDraft);
        window.dispatchEvent(new CustomEvent('workspaceStartNewSpace'));
        navigate('/');
        onClose();
    }, [activeProjectIdForDraft, navigate, onClose]);

    const handleDeleteSpace = useCallback(async (event, spaceId) => {
        event.stopPropagation();
        if (!confirm(t('sidebar.deleteConfirm'))) return;

        localStorage.removeItem(`blueprint_space_${spaceId}`);
        removeSpaceFromWorkspace(spaceId);

        if (supabase) {
            try {
                await supabase.from('spaces').delete().eq('id', spaceId);
            } catch {
                // Ignore remote delete failures after local removal.
            }
        }

        if (spaceId === currentSpaceId) navigate('/');
        fetchSpaces();
    }, [currentSpaceId, fetchSpaces, navigate, t]);

    const handleCreateProject = useCallback(() => {
        const trimmedName = newProjectName.trim();
        if (!trimmedName) return;
        createWorkspaceProject(trimmedName);
        setNewProjectName('');
        setIsCreatingProject(false);
    }, [newProjectName]);

    const handleAssignCurrentSpaceToProject = useCallback(() => {
        if (!currentSpaceId || !selectedProjectId) return;
        const activeSpace = spaces.find((space) => space.id === currentSpaceId);
        assignSpaceToProject(currentSpaceId, selectedProjectId, activeSpace?.title || '');
        try {
            const raw = localStorage.getItem(`blueprint_space_${currentSpaceId}`);
            if (raw) {
                syncWorkspaceProjectFromSpace(currentSpaceId, JSON.parse(raw), selectedProjectId);
            }
        } catch {
            // Ignore invalid local snapshots when assigning a project.
        }
    }, [currentSpaceId, selectedProjectId, spaces]);

    const searchedSpaces = useMemo(() => (
        spaces.filter((space) => (
            !searchQuery || (space.title || '').toLowerCase().includes(searchQuery.toLowerCase())
        ))
    ), [searchQuery, spaces]);

    const pinnedSpaces = useMemo(() => (
        searchedSpaces.filter((space) => workspaceMeta.spaces[space.id]?.pinned)
    ), [searchedSpaces, workspaceMeta.spaces]);

    const listedSpaces = useMemo(() => (
        searchedSpaces.filter((space) => {
            if (workspaceMeta.spaces[space.id]?.pinned) return false;
            if (!selectedProjectId) return true;
            return workspaceMeta.spaces[space.id]?.projectId === selectedProjectId;
        })
    ), [searchedSpaces, selectedProjectId, workspaceMeta.spaces]);

    const selectedProject = workspaceMeta.projects.find((project) => project.id === (selectedProjectId || routeProjectId)) || null;
    const canAttachCurrentSpace = Boolean(
        currentSpaceId
        && selectedProjectId
        && workspaceMeta.spaces[currentSpaceId]?.projectId !== selectedProjectId,
    );

    const getProjectNameForSpace = useCallback((spaceId) => {
        const projectId = workspaceMeta.spaces[spaceId]?.projectId;
        return workspaceMeta.projects.find((project) => project.id === projectId)?.name || '';
    }, [workspaceMeta.projects, workspaceMeta.spaces]);

    return (
        <>
            {isOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 998, backdropFilter: 'blur(2px)' }}
                    onClick={onClose}
                />
            )}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: isOpen ? '292px' : '0',
                background: 'var(--panel-bg)',
                backdropFilter: 'blur(30px)',
                WebkitBackdropFilter: 'blur(30px)',
                borderRight: isOpen ? '1px solid var(--panel-border)' : 'none',
                boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.3)' : 'none',
                zIndex: 999,
                overflow: 'hidden',
                transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
            }}
            >
                <div style={{ padding: '0.7rem 0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', minWidth: '260px' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>ワークスペース</span>
                    <button className="btn-icon" onClick={onClose} style={{ width: '26px', height: '26px' }}><X size={14} /></button>
                </div>

                <div style={{ padding: '0.75rem 0.8rem 0.5rem', display: 'grid', gap: '0.45rem', minWidth: '260px' }}>
                    <button
                        onClick={handleNewSpace}
                        style={{
                            width: '100%',
                            background: 'linear-gradient(135deg, var(--primary) 0%, #748ffc 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '0.58rem',
                            borderRadius: '10px',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.42rem',
                            fontFamily: 'inherit',
                            boxShadow: '0 4px 12px rgba(92, 124, 250, 0.3)',
                        }}
                    >
                        <Plus size={14} />
                        新しいスペース
                    </button>

                    <button
                        onClick={() => setIsCreatingProject((current) => !current)}
                        style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--panel-border)',
                            color: 'var(--text-main)',
                            padding: '0.52rem',
                            borderRadius: '10px',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.42rem',
                            fontFamily: 'inherit',
                        }}
                    >
                        <FolderPlus size={13} />
                        新しいプロジェクト
                    </button>

                    {isCreatingProject && (
                        <div style={{ display: 'grid', gap: '0.38rem' }}>
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={(event) => setNewProjectName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') handleCreateProject();
                                }}
                                placeholder="プロジェクト名"
                                style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid var(--panel-border)',
                                    color: 'var(--text-main)',
                                    padding: '0.48rem 0.6rem',
                                    fontSize: '0.78rem',
                                    borderRadius: '8px',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                }}
                            />
                            <button
                                onClick={handleCreateProject}
                                style={{
                                    background: 'rgba(108, 140, 255, 0.12)',
                                    border: '1px solid rgba(108, 140, 255, 0.18)',
                                    color: '#dbe5ff',
                                    padding: '0.45rem',
                                    fontSize: '0.76rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                作成する
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ padding: '0 0.8rem 0.45rem', minWidth: '260px' }}>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--panel-border)', borderRadius: '8px', alignItems: 'center', padding: '0 0.45rem' }}>
                        <Search size={12} color="var(--text-muted)" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="スペースを検索"
                            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', padding: '0.42rem 0.45rem', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit' }}
                        />
                    </div>
                </div>

                <div style={{ padding: '0 0.8rem 0.45rem', minWidth: '260px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Projects</span>
                        {selectedProject && (
                            <span style={{ fontSize: '0.68rem', color: '#c6d4ff' }}>{selectedProject.name}</span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setSelectedProjectId(null);
                            setDraftProjectId(null);
                        }}
                        style={{
                            width: '100%',
                            marginBottom: '0.3rem',
                            padding: '0.46rem 0.55rem',
                            borderRadius: '8px',
                            border: '1px solid var(--panel-border)',
                            background: !selectedProjectId ? 'rgba(108, 140, 255, 0.12)' : 'rgba(255,255,255,0.03)',
                            color: !selectedProjectId ? '#dbe5ff' : 'var(--text-main)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            fontSize: '0.76rem',
                            fontFamily: 'inherit',
                        }}
                    >
                        <FolderOpen size={13} />
                        すべてのスペース
                    </button>

                    {workspaceMeta.projects.map((project) => {
                        const isSelected = selectedProjectId === project.id;

                        return (
                            <button
                                key={project.id}
                                type="button"
                                onClick={() => {
                                    setSelectedProjectId(project.id);
                                    if (!currentSpaceId) {
                                        setDraftProjectId(project.id);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    marginBottom: '0.3rem',
                                    padding: '0.46rem 0.55rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--panel-border)',
                                    background: isSelected ? 'rgba(108, 140, 255, 0.12)' : 'rgba(255,255,255,0.03)',
                                    color: isSelected ? '#dbe5ff' : 'var(--text-main)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.45rem',
                                    fontSize: '0.76rem',
                                    fontFamily: 'inherit',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.42rem', minWidth: 0 }}>
                                    {isSelected ? <FolderOpen size={13} /> : <FolderClosed size={13} />}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                                </span>
                                <span style={{ fontSize: '0.68rem', opacity: 0.75 }}>{project.spaceIds.length}</span>
                            </button>
                        );
                    })}

                    {canAttachCurrentSpace && (
                        <button
                            type="button"
                            onClick={handleAssignCurrentSpaceToProject}
                            style={{
                                width: '100%',
                                marginTop: '0.2rem',
                                padding: '0.45rem 0.55rem',
                                borderRadius: '8px',
                                border: '1px dashed rgba(108, 140, 255, 0.24)',
                                background: 'rgba(108, 140, 255, 0.08)',
                                color: '#dbe5ff',
                                cursor: 'pointer',
                                fontSize: '0.74rem',
                                fontFamily: 'inherit',
                            }}
                        >
                            現在のスペースをこのプロジェクトに追加
                        </button>
                    )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0.15rem 0.45rem 0.7rem', minWidth: '260px' }}>
                    {loading ? (
                        <p style={{ padding: '0.9rem', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>{t('sidebar.loading')}</p>
                    ) : (
                        <>
                            {pinnedSpaces.length > 0 && (
                                <div style={{ marginBottom: '0.8rem' }}>
                                    <div style={{ padding: '0 0.45rem 0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                        Pinned
                                    </div>
                                    {pinnedSpaces.map((space) => (
                                        <SidebarSpaceRow
                                            key={`pinned-${space.id}`}
                                            space={space}
                                            currentSpaceId={currentSpaceId}
                                            projectName={getProjectNameForSpace(space.id)}
                                            isPinned
                                            onOpen={(spaceId) => {
                                                navigate(getSpacePath(spaceId, currentMode));
                                                onClose();
                                            }}
                                            onPin={() => togglePinnedSpace(space.id)}
                                            onDelete={handleDeleteSpace}
                                        />
                                    ))}
                                </div>
                            )}

                            <div>
                                <div style={{ padding: '0 0.45rem 0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                    {selectedProject ? `${selectedProject.name}` : 'Spaces'}
                                </div>
                                {listedSpaces.length === 0 ? (
                                    <p style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
                                        {selectedProject ? 'このプロジェクトのスペースはまだありません' : t('sidebar.empty')}
                                    </p>
                                ) : (
                                    listedSpaces.map((space) => (
                                        <SidebarSpaceRow
                                            key={space.id}
                                            space={space}
                                            currentSpaceId={currentSpaceId}
                                            projectName={getProjectNameForSpace(space.id)}
                                            isPinned={Boolean(workspaceMeta.spaces[space.id]?.pinned)}
                                            onOpen={(spaceId) => {
                                                navigate(getSpacePath(spaceId, currentMode));
                                                onClose();
                                            }}
                                            onPin={() => togglePinnedSpace(space.id)}
                                            onDelete={handleDeleteSpace}
                                        />
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div style={{ padding: '0.55rem 0.7rem', borderTop: '1px solid var(--panel-border)', minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {onOpenSettings && (
                        <button
                            onClick={onOpenSettings}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--panel-border)',
                                padding: '0.45rem',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.3rem',
                                fontFamily: 'inherit',
                            }}
                        >
                            <Settings size={11} /> {t('editor.settings')}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

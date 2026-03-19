import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Edit3,
    FolderClosed,
    FolderOpen,
    FolderPlus,
    BookOpen,
    MessageSquare,
    Pin,
    Plus,
    Search,
    Settings,
    Trash2,
    X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useLanguage } from './i18n';
import { DEFAULT_SPACE_MODE, getDictionaryPath, getSpacePath, isSpaceMode, resolveSpaceRouteParams } from './lib/routes';
import { resolveSpaceTitle } from './lib/space';
import {
    assignSpaceToProject,
    createWorkspaceProject,
    loadWorkspaceMeta,
    removeSpaceFromWorkspace,
    renameWorkspaceSpace,
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
    showPin = true,
    nested = false,
    draggable = false,
    isDragging = false,
    onOpen,
    onRename,
    onPin,
    onDelete,
    onDragStart,
    onDragEnd,
}) {
    return (
        <div
            className="sidebar-item"
            onClick={() => onOpen(space.id)}
            draggable={draggable}
            onDragStart={(event) => onDragStart && onDragStart(event, space.id)}
            onDragEnd={onDragEnd}
            style={{
                padding: nested ? '0.48rem 0.55rem 0.48rem 0.85rem' : '0.52rem 0.6rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: space.id === currentSpaceId ? 'linear-gradient(90deg, rgba(92, 124, 250, 0.15) 0%, transparent 100%)' : 'transparent',
                borderLeft: space.id === currentSpaceId ? '3px solid var(--primary)' : '3px solid transparent',
                borderRadius: '0 8px 8px 0',
                cursor: draggable ? 'grab' : 'pointer',
                marginBottom: '0.24rem',
                transition: 'background 0.2s ease, opacity 0.2s ease',
                opacity: isDragging ? 0.45 : 1,
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
                    onRename(space.id);
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
                title="Rename"
                aria-label="Rename"
            >
                <Edit3 size={12} />
            </button>
            {showPin && (
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
                    title={isPinned ? 'Unpin' : 'Pin'}
                    aria-label={isPinned ? 'Unpin' : 'Pin'}
                >
                    <Pin size={12} fill={isPinned ? 'currentColor' : 'none'} />
                </button>
            )}
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
                title="Delete"
                aria-label="Delete"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}

export default function Sidebar({ isOpen, onClose, onOpenSettings }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const routeParams = useParams();
    const { spaceId: currentSpaceId, mode } = resolveSpaceRouteParams(routeParams);
    const [spaces, setSpaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [workspaceMetaVersion, setWorkspaceMetaVersion] = useState(0);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [expandedProjectIds, setExpandedProjectIds] = useState({});
    const [draggedSpaceId, setDraggedSpaceId] = useState(null);
    const [dragOverProjectId, setDragOverProjectId] = useState(null);
    const currentMode = isSpaceMode(mode) ? mode : DEFAULT_SPACE_MODE;
    const dictionarySpaceId = currentSpaceId || spaces[0]?.id || null;

    const workspaceMeta = useMemo(() => {
        void workspaceMetaVersion;
        return loadWorkspaceMeta();
    }, [workspaceMetaVersion]);

    const routeProjectId = currentSpaceId ? (workspaceMeta.spaces[currentSpaceId]?.projectId || null) : null;
    const selectedProjectId = workspaceMeta.selectedProjectId || null;
    const activeProjectId = selectedProjectId || routeProjectId || null;

    const fetchSpaces = useCallback(async () => {
        setLoading(true);
        const nextSpaces = [];

        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith('blueprint_space_')) continue;

            try {
                const spaceData = JSON.parse(localStorage.getItem(key));
                const id = key.replace('blueprint_space_', '');
                nextSpaces.push({
                    id,
                    title: resolveSpaceTitle(id, spaceData.title, t('editor.untitled')),
                    updated_at: spaceData.updated_at || new Date().toISOString(),
                });
            } catch {
                // Ignore malformed local snapshots.
            }
        }

        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('spaces')
                    .select('id, title, updated_at')
                    .order('updated_at', { ascending: false });
                if (!error && data) {
                    data.forEach((remoteSpace) => {
                        const resolvedRemoteSpace = {
                            ...remoteSpace,
                            title: resolveSpaceTitle(remoteSpace.id, remoteSpace.title, t('editor.untitled')),
                        };
                        const existingIndex = nextSpaces.findIndex((space) => space.id === remoteSpace.id);
                        if (existingIndex >= 0) {
                            nextSpaces[existingIndex] = resolvedRemoteSpace;
                        } else {
                            nextSpaces.push(resolvedRemoteSpace);
                        }
                    });
                }
            } catch {
                // Ignore remote fetch failures and keep local data.
            }
        }

        nextSpaces.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        setSpaces(nextSpaces);
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
        setDraftProjectId(null);
        window.dispatchEvent(new CustomEvent('workspaceStartNewSpace'));
        navigate('/');
        onClose();
    }, [navigate, onClose]);

    const handleDeleteSpace = async (event, spaceId) => {
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
    };

    const handleRenameSpace = useCallback(async (targetSpaceId) => {
        const targetSpace = spaces.find((space) => space.id === targetSpaceId);
        const currentTitle = resolveSpaceTitle(targetSpaceId, targetSpace?.title, t('editor.untitled'));
        const nextTitle = window.prompt('スペース名を変更', currentTitle);
        if (nextTitle === null) return;

        const cleanedTitle = nextTitle.trim() || resolveSpaceTitle(targetSpaceId, '', t('editor.untitled'));

        try {
            const storageKey = `blueprint_space_${targetSpaceId}`;
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                localStorage.setItem(storageKey, JSON.stringify({
                    ...parsed,
                    title: cleanedTitle,
                    updated_at: new Date().toISOString(),
                }));
            }
        } catch {
            // Ignore malformed local snapshots during rename.
        }

        renameWorkspaceSpace(targetSpaceId, cleanedTitle);

        if (supabase) {
            try {
                await supabase
                    .from('spaces')
                    .update({ title: cleanedTitle, updated_at: new Date().toISOString() })
                    .eq('id', targetSpaceId);
            } catch {
                // Keep local rename even if remote update fails.
            }
        }

        window.dispatchEvent(new CustomEvent('spaceTitleUpdated'));
        fetchSpaces();
    }, [fetchSpaces, spaces, t]);

    const handleCreateProject = useCallback(() => {
        const trimmedName = newProjectName.trim();
        if (!trimmedName) return;
        createWorkspaceProject(trimmedName);
        setNewProjectName('');
        setIsCreatingProject(false);
    }, [newProjectName]);

    const handleAssignSpaceToProject = useCallback((spaceId, projectId) => {
        if (!spaceId || !projectId) return;
        const targetSpace = spaces.find((space) => space.id === spaceId);
        assignSpaceToProject(spaceId, projectId, targetSpace?.title || '');
        try {
            const raw = localStorage.getItem(`blueprint_space_${spaceId}`);
            if (raw) {
                syncWorkspaceProjectFromSpace(spaceId, JSON.parse(raw), projectId);
            }
        } catch {
            // Ignore invalid local snapshots when assigning a project.
        }
    }, [spaces]);

    const searchedSpaces = useMemo(() => (
        spaces.filter((space) => (
            !searchQuery || (space.title || '').toLowerCase().includes(searchQuery.toLowerCase())
        ))
    ), [searchQuery, spaces]);

    const pinnedSpaces = useMemo(() => (
        searchedSpaces.filter((space) => {
            const meta = workspaceMeta.spaces[space.id];
            return meta?.pinned && !meta?.projectId;
        })
    ), [searchedSpaces, workspaceMeta.spaces]);

    const unpinnedSpaces = useMemo(() => (
        searchedSpaces.filter((space) => !workspaceMeta.spaces[space.id]?.pinned)
    ), [searchedSpaces, workspaceMeta.spaces]);

    const projectSpacesById = useMemo(() => (
        workspaceMeta.projects.reduce((accumulator, project) => {
            accumulator[project.id] = unpinnedSpaces.filter((space) => workspaceMeta.spaces[space.id]?.projectId === project.id);
            return accumulator;
        }, {})
    ), [unpinnedSpaces, workspaceMeta.projects, workspaceMeta.spaces]);

    const visibleProjects = useMemo(() => (
        workspaceMeta.projects.filter((project) => {
            if (!searchQuery) return true;
            return project.name.toLowerCase().includes(searchQuery.toLowerCase()) || (projectSpacesById[project.id] || []).length > 0;
        })
    ), [projectSpacesById, searchQuery, workspaceMeta.projects]);

    const unassignedSpaces = useMemo(() => (
        unpinnedSpaces.filter((space) => !workspaceMeta.spaces[space.id]?.projectId)
    ), [unpinnedSpaces, workspaceMeta.spaces]);

    const selectedProject = workspaceMeta.projects.find((project) => project.id === activeProjectId) || null;

    const getProjectNameForSpace = useCallback((spaceId) => {
        const projectId = workspaceMeta.spaces[spaceId]?.projectId;
        return workspaceMeta.projects.find((project) => project.id === projectId)?.name || '';
    }, [workspaceMeta.projects, workspaceMeta.spaces]);

    const handleProjectFolderClick = useCallback((projectId) => {
        setSelectedProjectId(projectId);
        if (!currentSpaceId) {
            setDraftProjectId(projectId);
        }
        setExpandedProjectIds((current) => ({
            ...current,
            [projectId]: activeProjectId === projectId
                ? !(current[projectId] ?? true)
                : true,
        }));
    }, [activeProjectId, currentSpaceId]);

    const handleSpaceDragStart = useCallback((event, spaceId) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', spaceId);
        setDraggedSpaceId(spaceId);
    }, []);

    const handleSpaceDragEnd = useCallback(() => {
        setDraggedSpaceId(null);
        setDragOverProjectId(null);
    }, []);

    const handleProjectDragOver = useCallback((event, projectId) => {
        if (!draggedSpaceId) return;
        if (workspaceMeta.spaces[draggedSpaceId]?.projectId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOverProjectId(projectId);
    }, [draggedSpaceId, workspaceMeta.spaces]);

    const handleProjectDrop = useCallback((event, projectId) => {
        const droppedSpaceId = event.dataTransfer.getData('text/plain') || draggedSpaceId;
        event.preventDefault();
        setDragOverProjectId(null);
        setDraggedSpaceId(null);
        if (!droppedSpaceId || workspaceMeta.spaces[droppedSpaceId]?.projectId) return;
        handleAssignSpaceToProject(droppedSpaceId, projectId);
    }, [draggedSpaceId, handleAssignSpaceToProject, workspaceMeta.spaces]);

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
                    <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{t('sidebar.title')}</span>
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
                            placeholder={t('sidebar.search')}
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

                    {visibleProjects.map((project) => {
                        const isSelected = activeProjectId === project.id;
                        const isExpanded = expandedProjectIds[project.id] ?? isSelected;
                        const projectSpaces = projectSpacesById[project.id] || [];
                        const isDropTarget = dragOverProjectId === project.id;

                        return (
                            <div
                                key={project.id}
                                onDragOver={(event) => handleProjectDragOver(event, project.id)}
                                onDragLeave={() => {
                                    if (dragOverProjectId === project.id) {
                                        setDragOverProjectId(null);
                                    }
                                }}
                                onDrop={(event) => handleProjectDrop(event, project.id)}
                                style={{
                                    marginBottom: '0.3rem',
                                    borderRadius: '8px',
                                    border: isDropTarget ? '1px solid rgba(108, 140, 255, 0.45)' : '1px solid var(--panel-border)',
                                    background: isDropTarget
                                        ? 'rgba(108, 140, 255, 0.16)'
                                        : isSelected
                                            ? 'rgba(108, 140, 255, 0.12)'
                                            : 'rgba(255,255,255,0.03)',
                                    boxShadow: isDropTarget ? '0 0 0 1px rgba(108, 140, 255, 0.12)' : 'none',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleProjectFolderClick(project.id)}
                                    style={{
                                        width: '100%',
                                        padding: '0.46rem 0.55rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'transparent',
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
                                        {isExpanded ? <FolderOpen size={13} /> : <FolderClosed size={13} />}
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                                    </span>
                                    <span style={{ fontSize: '0.68rem', opacity: 0.75 }}>{project.spaceIds.length}</span>
                                </button>

                                {isExpanded && (
                                    <div style={{ padding: '0 0.2rem 0.3rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        {projectSpaces.length === 0 ? (
                                            <p style={{ padding: '0.65rem 0.6rem 0.2rem', margin: 0, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                                                このプロジェクトにはまだスペースがありません
                                            </p>
                                        ) : (
                                            projectSpaces.map((space) => (
                                                <SidebarSpaceRow
                                                    key={space.id}
                                                    space={space}
                                                    currentSpaceId={currentSpaceId}
                                                    projectName=""
                                                    isPinned={Boolean(workspaceMeta.spaces[space.id]?.pinned)}
                                                    showPin={false}
                                                    nested
                                                    onOpen={(spaceId) => {
                                                        navigate(getSpacePath(spaceId, currentMode));
                                                        onClose();
                                                    }}
                                                    onRename={handleRenameSpace}
                                                    onPin={() => togglePinnedSpace(space.id)}
                                                    onDelete={handleDeleteSpace}
                                                />
                                            ))
                                        )}
                                        {isDropTarget && (
                                            <div style={{ padding: '0.4rem 0.55rem 0.15rem', color: '#dbe5ff', fontSize: '0.72rem' }}>
                                                未分類のスペースをここに移動
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
                                            draggable={!workspaceMeta.spaces[space.id]?.projectId}
                                            isDragging={draggedSpaceId === space.id}
                                            onOpen={(spaceId) => {
                                                navigate(getSpacePath(spaceId, currentMode));
                                                onClose();
                                            }}
                                            onRename={handleRenameSpace}
                                            onPin={() => togglePinnedSpace(space.id)}
                                            onDelete={handleDeleteSpace}
                                            onDragStart={handleSpaceDragStart}
                                            onDragEnd={handleSpaceDragEnd}
                                        />
                                    ))}
                                </div>
                            )}

                            <div>
                                <div style={{ padding: '0 0.45rem 0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                    未分類のスペース
                                </div>
                                {unassignedSpaces.length === 0 ? (
                                    <p style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
                                        {t('sidebar.empty')}
                                    </p>
                                ) : (
                                    unassignedSpaces.map((space) => (
                                        <SidebarSpaceRow
                                            key={space.id}
                                            space={space}
                                            currentSpaceId={currentSpaceId}
                                            projectName=""
                                            isPinned={Boolean(workspaceMeta.spaces[space.id]?.pinned)}
                                            draggable
                                            isDragging={draggedSpaceId === space.id}
                                            onOpen={(spaceId) => {
                                                navigate(getSpacePath(spaceId, currentMode));
                                                onClose();
                                            }}
                                            onRename={handleRenameSpace}
                                            onPin={() => togglePinnedSpace(space.id)}
                                            onDelete={handleDeleteSpace}
                                            onDragStart={handleSpaceDragStart}
                                            onDragEnd={handleSpaceDragEnd}
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
                            onClick={() => {
                                if (!dictionarySpaceId) return;
                                navigate(getDictionaryPath(dictionarySpaceId));
                                onClose();
                            }}
                            disabled={!dictionarySpaceId}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid var(--panel-border)',
                                padding: '0.45rem',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: 'var(--text-main)',
                                cursor: dictionarySpaceId ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.3rem',
                                fontFamily: 'inherit',
                                opacity: dictionarySpaceId ? 1 : 0.55,
                            }}
                        >
                            <BookOpen size={11} /> 辞書
                        </button>
                    )}
                    {onOpenSettings && (
                        <button
                            onClick={() => {
                                onClose();
                                onOpenSettings();
                            }}
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

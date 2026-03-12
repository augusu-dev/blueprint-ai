import { deriveStudySettings } from './studySettings';

const WORKSPACE_META_KEY = 'blueprint_workspace_meta_v1';

function createDefaultWorkspaceMeta() {
    return {
        draftProjectId: null,
        selectedProjectId: null,
        projects: [],
        spaces: {},
    };
}

function normalizeProject(project) {
    return {
        id: project?.id || crypto.randomUUID(),
        name: (project?.name || '新しいプロジェクト').trim() || '新しいプロジェクト',
        createdAt: project?.createdAt || new Date().toISOString(),
        updatedAt: project?.updatedAt || new Date().toISOString(),
        sharedGoal: typeof project?.sharedGoal === 'string' ? project.sharedGoal : '',
        sharedMemory: typeof project?.sharedMemory === 'string' ? project.sharedMemory : '',
        spaceIds: Array.isArray(project?.spaceIds) ? [...new Set(project.spaceIds.filter(Boolean))] : [],
    };
}

function normalizeWorkspaceMeta(raw) {
    const projects = Array.isArray(raw?.projects) ? raw.projects.map(normalizeProject) : [];
    const spaces = Object.entries(raw?.spaces || {}).reduce((accumulator, [spaceId, value]) => {
        if (!spaceId) return accumulator;

        accumulator[spaceId] = {
            pinned: Boolean(value?.pinned),
            projectId: value?.projectId || null,
            title: typeof value?.title === 'string' ? value.title : '',
        };
        return accumulator;
    }, {});

    return {
        draftProjectId: raw?.draftProjectId || null,
        selectedProjectId: raw?.selectedProjectId || null,
        projects,
        spaces,
    };
}

export function loadWorkspaceMeta() {
    try {
        const raw = localStorage.getItem(WORKSPACE_META_KEY);
        return normalizeWorkspaceMeta(raw ? JSON.parse(raw) : null);
    } catch {
        return createDefaultWorkspaceMeta();
    }
}

export function saveWorkspaceMeta(nextMeta) {
    const normalized = normalizeWorkspaceMeta(nextMeta);
    localStorage.setItem(WORKSPACE_META_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('workspaceMetaUpdated'));
    return normalized;
}

function deriveProjectInsights(spaceData) {
    const starterNode = (spaceData?.nodes || []).find((node) => node?.data?.isStarter) || null;
    const sharedGoal = starterNode?.data?.systemPrompt?.trim() || '';
    const sharedMemory = (starterNode?.data?.chatHistory || [])
        .filter((message) => (message?.role === 'user' || message?.role === 'ai') && typeof message?.content === 'string')
        .slice(-6)
        .map((message) => `${message.role === 'user' ? 'User' : 'AI'}: ${message.content.trim().slice(0, 180)}`)
        .join('\n');

    return { sharedGoal, sharedMemory };
}

export function createWorkspaceProject(name) {
    const meta = loadWorkspaceMeta();
    const now = new Date().toISOString();
    const project = normalizeProject({
        id: crypto.randomUUID(),
        name,
        createdAt: now,
        updatedAt: now,
    });

    return saveWorkspaceMeta({
        ...meta,
        selectedProjectId: project.id,
        draftProjectId: project.id,
        projects: [project, ...meta.projects],
    });
}

export function setSelectedProjectId(projectId) {
    const meta = loadWorkspaceMeta();
    return saveWorkspaceMeta({
        ...meta,
        selectedProjectId: projectId || null,
    });
}

export function setDraftProjectId(projectId) {
    const meta = loadWorkspaceMeta();
    return saveWorkspaceMeta({
        ...meta,
        draftProjectId: projectId || null,
        selectedProjectId: projectId || meta.selectedProjectId || null,
    });
}

export function togglePinnedSpace(spaceId) {
    const meta = loadWorkspaceMeta();
    const nextSpace = meta.spaces[spaceId] || {};
    return saveWorkspaceMeta({
        ...meta,
        spaces: {
            ...meta.spaces,
            [spaceId]: {
                ...nextSpace,
                pinned: !nextSpace.pinned,
            },
        },
    });
}

export function assignSpaceToProject(spaceId, projectId, title = '') {
    const meta = loadWorkspaceMeta();
    const previousProjectId = meta.spaces[spaceId]?.projectId || null;
    const nextProjects = meta.projects.map((project) => {
        if (project.id === previousProjectId && previousProjectId !== projectId) {
            return { ...project, spaceIds: project.spaceIds.filter((id) => id !== spaceId) };
        }

        if (project.id === projectId) {
            return {
                ...project,
                updatedAt: new Date().toISOString(),
                spaceIds: [...new Set([...project.spaceIds, spaceId])],
            };
        }

        return project;
    });

    return saveWorkspaceMeta({
        ...meta,
        selectedProjectId: projectId || meta.selectedProjectId || null,
        spaces: {
            ...meta.spaces,
            [spaceId]: {
                ...(meta.spaces[spaceId] || {}),
                title,
                projectId: projectId || null,
            },
        },
        projects: nextProjects,
    });
}

export function removeSpaceFromWorkspace(spaceId) {
    const meta = loadWorkspaceMeta();
    const nextSpaces = { ...meta.spaces };
    delete nextSpaces[spaceId];

    return saveWorkspaceMeta({
        ...meta,
        spaces: nextSpaces,
        projects: meta.projects.map((project) => ({
            ...project,
            spaceIds: project.spaceIds.filter((id) => id !== spaceId),
        })),
    });
}

export function syncWorkspaceProjectFromSpace(spaceId, spaceData, explicitProjectId = undefined) {
    const meta = loadWorkspaceMeta();
    const projectId = explicitProjectId === undefined ? meta.spaces[spaceId]?.projectId || null : explicitProjectId;
    const nextSpaces = {
        ...meta.spaces,
        [spaceId]: {
            ...(meta.spaces[spaceId] || {}),
            title: spaceData?.title || meta.spaces[spaceId]?.title || '',
            projectId,
        },
    };

    const insights = deriveProjectInsights(spaceData);
    const nextProjects = meta.projects.map((project) => {
        if (project.id !== projectId) {
            return explicitProjectId !== undefined && project.spaceIds.includes(spaceId)
                ? { ...project, spaceIds: project.spaceIds.filter((id) => id !== spaceId) }
                : project;
        }

        return {
            ...project,
            updatedAt: new Date().toISOString(),
            sharedGoal: insights.sharedGoal || project.sharedGoal,
            sharedMemory: insights.sharedMemory || project.sharedMemory,
            spaceIds: [...new Set([...project.spaceIds, spaceId])],
        };
    });

    return saveWorkspaceMeta({
        ...meta,
        spaces: nextSpaces,
        projects: nextProjects,
        selectedProjectId: projectId || meta.selectedProjectId || null,
    });
}

export function getProjectContextPrompt(project) {
    if (!project) return '';

    const studySettings = deriveStudySettings(project.sharedGoal);
    const sections = [
        '[プロジェクト共有コンテキスト]',
        `プロジェクト名: ${project.name}`,
    ];

    if (project.sharedGoal) {
        sections.push(`共有目標: ${project.sharedGoal}`);
    }

    if (project.sharedMemory) {
        sections.push(`共有メモ:\n${project.sharedMemory}`);
    }

    if (studySettings.deadlineLabel) {
        sections.push(`期限: ${studySettings.deadlineLabel}`);
    } else if (studySettings.timelineLabel) {
        sections.push(`タイムライン: ${studySettings.timelineLabel}`);
    }

    if (studySettings.learningStyleLabel) {
        sections.push(`学習スタイル: ${studySettings.learningStyleLabel}`);
    }

    sections.push(`標準レビュー運用: ${studySettings.reviewCadenceLabel}で軽いテストを回し、必要なら計画を微調整する。`);
    sections.push('上記の文脈を踏まえて回答し、学習の進み具合に応じて調整案も提案してください。');
    return sections.join('\n');
}

import { deriveStudySettings } from './studySettings';

const WORKSPACE_META_KEY = 'blueprint_workspace_meta_v1';

function createDefaultPlanSection() {
    return {
        history: [],
        interactiveStates: {},
        selectedOptions: {},
        updatedAt: null,
    };
}

function normalizePlanSection(section) {
    return {
        history: Array.isArray(section?.history) ? section.history : [],
        interactiveStates: section?.interactiveStates && typeof section.interactiveStates === 'object' ? section.interactiveStates : {},
        selectedOptions: section?.selectedOptions && typeof section.selectedOptions === 'object' ? section.selectedOptions : {},
        updatedAt: section?.updatedAt || null,
    };
}

function createImprovementVersion(version = '1.0.0') {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        version,
        createdAt: now,
        updatedAt: now,
        ...createDefaultPlanSection(),
    };
}

function normalizeImprovementVersion(version, fallbackVersion = '1.0.0') {
    return {
        id: version?.id || crypto.randomUUID(),
        version: version?.version || fallbackVersion,
        createdAt: version?.createdAt || new Date().toISOString(),
        updatedAt: version?.updatedAt || version?.createdAt || new Date().toISOString(),
        ...normalizePlanSection(version),
    };
}

function normalizeSharedSnapshot(snapshot) {
    return {
        nodes: Array.isArray(snapshot?.nodes) ? snapshot.nodes : [],
        edges: Array.isArray(snapshot?.edges) ? snapshot.edges : [],
        updatedAt: snapshot?.updatedAt || null,
    };
}

function createDefaultWorkspaceMeta() {
    return {
        draftProjectId: null,
        selectedProjectId: null,
        projects: [],
        spaces: {},
    };
}

function normalizeProject(project) {
    const improvementVersions = Array.isArray(project?.improvementVersions) && project.improvementVersions.length > 0
        ? project.improvementVersions.map((version, index) => normalizeImprovementVersion(version, `1.0.${index}`))
        : [createImprovementVersion()];
    const activeImprovementVersionId = project?.activeImprovementVersionId
        || improvementVersions[improvementVersions.length - 1]?.id
        || improvementVersions[0]?.id
        || null;

    return {
        id: project?.id || crypto.randomUUID(),
        name: (project?.name || '新しいプロジェクト').trim() || '新しいプロジェクト',
        createdAt: project?.createdAt || new Date().toISOString(),
        updatedAt: project?.updatedAt || new Date().toISOString(),
        sharedGoal: typeof project?.sharedGoal === 'string' ? project.sharedGoal : '',
        sharedMemory: typeof project?.sharedMemory === 'string' ? project.sharedMemory : '',
        spaceIds: Array.isArray(project?.spaceIds) ? [...new Set(project.spaceIds.filter(Boolean))] : [],
        planSpaceId: project?.planSpaceId || (Array.isArray(project?.spaceIds) && project.spaceIds[0]) || null,
        sharedSnapshot: normalizeSharedSnapshot(project?.sharedSnapshot),
        planSections: {
            plan: normalizePlanSection(project?.planSections?.plan),
            reward: normalizePlanSection(project?.planSections?.reward),
        },
        improvementVersions,
        activeImprovementVersionId,
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
        sharedSnapshot: normalizeSharedSnapshot(null),
        planSections: {
            plan: createDefaultPlanSection(),
            reward: createDefaultPlanSection(),
        },
        improvementVersions: [createImprovementVersion()],
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
                planSpaceId: project.planSpaceId || spaceId,
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
    const sharedSnapshot = Array.isArray(spaceData?.nodes) && Array.isArray(spaceData?.edges)
        ? normalizeSharedSnapshot({
            nodes: spaceData.nodes,
            edges: spaceData.edges,
            updatedAt: spaceData?.updated_at || new Date().toISOString(),
        })
        : null;
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

        const canSyncSharedSnapshot = !project.planSpaceId || project.planSpaceId === spaceId;

        return {
            ...project,
            updatedAt: new Date().toISOString(),
            sharedGoal: insights.sharedGoal || project.sharedGoal,
            sharedMemory: insights.sharedMemory || project.sharedMemory,
            planSpaceId: project.planSpaceId || spaceId,
            sharedSnapshot: canSyncSharedSnapshot ? (sharedSnapshot || project.sharedSnapshot) : project.sharedSnapshot,
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

function incrementPatchVersion(version) {
    const parts = `${version || '1.0.0'}`.split('.').map((value) => Number.parseInt(value, 10));
    const [major = 1, minor = 0, patch = 0] = parts;
    return `${major}.${minor}.${patch + 1}`;
}

function getLatestImprovementVersion(project) {
    return project?.improvementVersions?.[project.improvementVersions.length - 1] || null;
}

function getNextImprovementVersionLabel(project) {
    return incrementPatchVersion(getLatestImprovementVersion(project)?.version || '1.0.0');
}

export function getProjectPlanAccess(spaceId) {
    const meta = loadWorkspaceMeta();
    const projectId = meta.spaces[spaceId]?.projectId || null;
    const project = meta.projects.find((item) => item.id === projectId) || null;
    const activeImprovementVersion = project?.improvementVersions.find(
        (version) => version.id === project.activeImprovementVersionId,
    ) || project?.improvementVersions?.[project?.improvementVersions.length - 1] || null;

    return {
        meta,
        projectId,
        project,
        isProjectSpace: Boolean(project),
        planSpaceId: project?.planSpaceId || null,
        isPlanSpace: Boolean(project && spaceId && (project.planSpaceId || project.spaceIds[0]) === spaceId),
        activeImprovementVersion,
    };
}

export function saveProjectPlanSection(projectId, sectionId, nextSectionState) {
    const meta = loadWorkspaceMeta();
    const normalizedSection = normalizePlanSection({
        ...nextSectionState,
        updatedAt: new Date().toISOString(),
    });

    return saveWorkspaceMeta({
        ...meta,
        projects: meta.projects.map((project) => (
            project.id === projectId
                ? {
                    ...project,
                    updatedAt: new Date().toISOString(),
                    planSections: {
                        ...project.planSections,
                        [sectionId]: normalizedSection,
                    },
                }
                : project
        )),
    });
}

export function saveProjectImprovementVersion(projectId, versionId, nextSectionState) {
    const meta = loadWorkspaceMeta();

    return saveWorkspaceMeta({
        ...meta,
        projects: meta.projects.map((project) => (
            project.id === projectId
                ? {
                    ...project,
                    updatedAt: new Date().toISOString(),
                    improvementVersions: project.improvementVersions.map((version) => (
                        version.id === versionId
                            ? normalizeImprovementVersion({
                                ...version,
                                ...nextSectionState,
                                updatedAt: new Date().toISOString(),
                            }, version.version)
                            : version
                    )),
                    activeImprovementVersionId: versionId,
                }
                : project
        )),
    });
}

export function createProjectImprovementVersion(projectId, sourceVersionId = null) {
    const meta = loadWorkspaceMeta();
    let createdVersion = null;

    const nextProjects = meta.projects.map((project) => {
        if (project.id !== projectId) return project;

        const sourceVersion = project.improvementVersions.find((version) => version.id === sourceVersionId)
            || project.improvementVersions.find((version) => version.id === project.activeImprovementVersionId)
            || getLatestImprovementVersion(project)
            || createImprovementVersion();
        const nextVersionLabel = getNextImprovementVersionLabel(project);
        createdVersion = normalizeImprovementVersion({
            ...sourceVersion,
            id: crypto.randomUUID(),
            version: nextVersionLabel,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }, nextVersionLabel);

        return {
            ...project,
            updatedAt: new Date().toISOString(),
            improvementVersions: [...project.improvementVersions, createdVersion],
            activeImprovementVersionId: createdVersion.id,
        };
    });

    saveWorkspaceMeta({
        ...meta,
        projects: nextProjects,
    });

    return createdVersion;
}

export function restoreProjectImprovementVersion(projectId, versionId) {
    return createProjectImprovementVersion(projectId, versionId);
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

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { minimumPlanFor, type PlanLimits, type ProjectSettings } from '@lumora/shared';
import { api, type Catalog, type Me, type Project, type Workflow } from './api';

interface AppState {
  me: Me;
  catalog: Catalog;
  projects: Project[];
  refresh: () => Promise<void>;
  updateProject: (project: Project) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ me, catalog, initialProjects, children, onMe }: { me: Me; catalog: Catalog; initialProjects: Project[]; children: ReactNode; onMe: (me: Me) => void }) {
  const [projects, setProjects] = useState(initialProjects);
  const refresh = useCallback(async () => {
    const [nextMe, nextProjects] = await Promise.all([api<Me>('/me'), api<Project[]>('/projects')]);
    onMe(nextMe);
    setProjects(nextProjects);
  }, [onMe]);
  const updateProject = useCallback((p: Project) => setProjects((list) => list.map((x) => (x.id === p.id ? { ...x, ...p } : x))), []);
  const value = useMemo(() => ({ me, catalog, projects, refresh, updateProject }), [me, catalog, projects, refresh, updateProject]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

/** `lock('recording')` → the plan to upgrade to, or undefined if the current plan has it. */
export function useFeatureLock() {
  const { me } = useApp();
  return (feature: keyof PlanLimits['features']) => (me.limits.features[feature] ? undefined : minimumPlanFor(feature));
}

/** `tier('recording')` → the plan that introduces the feature ('free' for features every plan has). */
export function useFeatureTier() {
  return (feature: keyof PlanLimits['features']) => minimumPlanFor(feature);
}

/** Local draft of a project's settings with dirty tracking and save. */
export function useSettingsDraft(project: Project, onSaved: (p: Project) => void) {
  const [draft, setDraft] = useState<ProjectSettings>(project.settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(project.settings), [project]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(project.settings);
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api<Project>(`/projects/${project.id}`, { method: 'PATCH', body: { settings: draft } });
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };
  /** Immutable update helper: update(s => { s.appearance.position = 'bottom-left' }) */
  const update = (fn: (s: ProjectSettings) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  return { draft, update, dirty, saving, save, reset: () => setDraft(project.settings) };
}

// ---------- Hash routing ----------

export function useRoute(): string[] {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
}

export function navigate(path: string): void {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

/** Query string inside the hash (#/p/x/reports?status=open) — keeps filters shareable and in history. */
export function useHashQuery(): [URLSearchParams, (next: Record<string, string | undefined>) => void] {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(location.hash.split('?')[1] ?? '');
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === '') merged.delete(k);
      else merged.set(k, v);
    }
    const base = location.hash.split('?')[0];
    const qs = merged.toString();
    history.replaceState(null, '', `${base}${qs ? `?${qs}` : ''}`);
    setHash(location.hash);
  };
  return [params, update];
}

const workflows = new Map<string, Promise<Workflow>>();

/** The statuses to offer for a project (the connected tool's workflow, or Lumora's three). Shared across pages. */
export function useWorkflow(projectId: string, enabled = true): Workflow | null {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let promise = workflows.get(projectId);
    if (!promise) {
      promise = api<Workflow>(`/projects/${projectId}/workflow`);
      workflows.set(projectId, promise);
      promise.catch(() => workflows.delete(projectId));
    }
    let live = true;
    promise.then((w) => live && setWorkflow(w), () => {});
    return () => {
      live = false;
    };
  }, [projectId, enabled]);
  return workflow;
}

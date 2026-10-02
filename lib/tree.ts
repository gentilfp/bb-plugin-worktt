// Pure grouping for the worktree tree: project, then workspace (the
// environment a thread runs in), then threads. Kept free of React and the
// plugin runtime so it can be tested on its own.
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

export interface WorkspaceNode {
  /** Stable key: the environment id, or a per-project bucket for threads without one. */
  key: string;
  environmentId: string | null;
  label: string;
  /** The checkout's branch, shown as a tooltip when the label is a custom name. */
  branchName: string | null;
  /** The project's own checkout rather than a worktree. */
  isPrimary: boolean;
  /** Root threads, newest first, pinned first; children follow their parent. */
  threads: ThreadNode[];
  /** Newest activity in the workspace, for ordering worktrees. */
  updatedAt: number;
}

export interface ThreadNode {
  thread: PluginSidebarThread;
  depth: number;
}

export interface ProjectNode {
  project: PluginSidebarProject;
  workspaces: WorkspaceNode[];
  threadCount: number;
}

const BUSY_STATUSES = new Set(["starting", "active", "stopping"]);

export function isBusy(thread: PluginSidebarThread): boolean {
  return BUSY_STATUSES.has(thread.status);
}

function compareThreads(a: PluginSidebarThread, b: PluginSidebarThread) {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

/** A name the user gave the environment wins over its branch and machine. */
function workspaceLabel(thread: PluginSidebarThread): string {
  const env = thread.environment;
  return (
    env?.name ??
    env?.branchName ??
    thread.host?.name ??
    "No environment"
  );
}

/** Orders threads so each child sits right below its parent, one level deeper. */
function flattenWithChildren(threads: PluginSidebarThread[]): ThreadNode[] {
  const ids = new Set(threads.map((thread) => thread.id));
  const children = new Map<string, PluginSidebarThread[]>();
  const roots: PluginSidebarThread[] = [];
  for (const thread of threads) {
    const parent = thread.parentThreadId;
    if (parent && ids.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(thread);
      children.set(parent, list);
    } else {
      roots.push(thread);
    }
  }
  const out: ThreadNode[] = [];
  const visit = (thread: PluginSidebarThread, depth: number) => {
    out.push({ thread, depth });
    for (const child of (children.get(thread.id) ?? []).sort(compareThreads)) {
      visit(child, Math.min(depth + 1, 2));
    }
  };
  for (const root of roots.sort(compareThreads)) visit(root, 0);
  return out;
}

export function buildTree(
  projects: readonly PluginSidebarProject[],
  threads: readonly PluginSidebarThread[],
): ProjectNode[] {
  const byProject = new Map<string, PluginSidebarThread[]>();
  for (const thread of threads) {
    if (thread.isHidden || thread.isArchived) continue;
    const list = byProject.get(thread.projectId) ?? [];
    list.push(thread);
    byProject.set(thread.projectId, list);
  }

  return projects.map((project) => {
    const projectThreads = byProject.get(project.id) ?? [];
    const byWorkspace = new Map<string, PluginSidebarThread[]>();
    for (const thread of projectThreads) {
      const key = thread.environment?.id ?? `${project.id}:none`;
      const list = byWorkspace.get(key) ?? [];
      list.push(thread);
      byWorkspace.set(key, list);
    }

    const workspaces: WorkspaceNode[] = [...byWorkspace].map(
      ([key, list]) => {
        const sample = list[0]!;
        return {
          key,
          environmentId: sample.environment?.id ?? null,
          label: workspaceLabel(sample),
          branchName: sample.environment?.branchName ?? null,
          isPrimary: sample.environment?.isWorktree === false,
          threads: flattenWithChildren(list),
          updatedAt: Math.max(...list.map((thread) => thread.updatedAt)),
        };
      },
    );
    // The primary checkout first; worktrees by newest activity.
    workspaces.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

    return { project, workspaces, threadCount: projectThreads.length };
  });
}

export type SortMode = "activity-desc" | "activity-asc" | "name-asc" | "name-desc";

/**
 * Orders projects and workspaces. The primary checkout stays first in its
 * project. Threads keep their own order (pinned, then newest).
 */
export function sortTree(tree: ProjectNode[], mode: SortMode): ProjectNode[] {
  const dir = mode.endsWith("asc") ? 1 : -1;
  const byName = mode.startsWith("name");
  const activity = (node: ProjectNode) =>
    Math.max(0, ...node.workspaces.map((w) => w.updatedAt));
  const compare = <T,>(a: T, b: T, name: (x: T) => string, time: (x: T) => number) =>
    dir * (byName ? name(a).localeCompare(name(b)) : time(a) - time(b));

  return tree
    .map((node) => ({
      ...node,
      workspaces: [...node.workspaces].sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return compare(a, b, (w) => w.label, (w) => w.updatedAt);
      }),
    }))
    .sort((a, b) => compare(a, b, (n) => n.project.name, activity));
}

/**
 * Keeps what matches the query. A match on a project or workspace name keeps
 * everything under it; otherwise only matching threads stay. Groups left
 * empty are dropped.
 */
export function filterTree(tree: ProjectNode[], query: string): ProjectNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tree;
  const has = (text: string | null | undefined) =>
    text != null && text.toLowerCase().includes(needle);

  const out: ProjectNode[] = [];
  for (const node of tree) {
    if (has(node.project.name)) {
      out.push(node);
      continue;
    }
    const workspaces: WorkspaceNode[] = [];
    for (const workspace of node.workspaces) {
      if (has(workspace.label) || has(workspace.branchName)) {
        workspaces.push(workspace);
        continue;
      }
      const threads = workspace.threads.filter(({ thread }) => has(thread.displayTitle));
      if (threads.length > 0) workspaces.push({ ...workspace, threads });
    }
    if (workspaces.length === 0) continue;
    const threadCount = workspaces.reduce((sum, w) => sum + w.threads.length, 0);
    out.push({ ...node, workspaces, threadCount });
  }
  return out;
}

export function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

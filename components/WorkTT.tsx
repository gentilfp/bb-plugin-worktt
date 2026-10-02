// The worktree sidebar: projects, then the workspaces (primary checkout and
// worktrees) inside each, then the threads running in each workspace.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { toast } from "sonner";
import {
  ThreadTitle,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  useSidebarThreadDraft,
  useSdk,
  useSidebarThreadShortcut,
  type PluginSidebarPullRequest,
  type PluginSidebarThread,
  type PluginSidebarThreadIndicator,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { ThreadHoverCard } from "@/components/ThreadHoverCard";
import { cn } from "@/lib/utils";
import {
  buildTree,
  filterTree,
  formatAge,
  isBusy,
  sortTree,
  type SortMode,
  type ProjectNode,
  type ThreadNode,
  type WorkspaceNode,
} from "@/lib/tree";

const COLLAPSED_KEY = "worktt:collapsed";

/** Collapsed project and workspace keys, kept per client in localStorage. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      return new Set(Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : []);
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Storage can be full or blocked; collapse still works for this session.
      }
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

/** Re-renders once a minute so relative ages stay current. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function WorkTT(props: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const { collapsed, toggle } = useCollapsed();
  const now = useNow();
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildTree(projects, threads), [projects, threads]);
  const [sort, setSort] = useState<SortMode>("activity-desc");
  const filtered = useMemo(
    () => sortTree(filterTree(tree, query), sort),
    [tree, query, sort],
  );
  const isFiltering = query.trim() !== "";
  const noCollapsed = useMemo<ReadonlySet<string>>(() => new Set(), []);

  if (status === "loading" && threads.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>;
  }
  if (status === "error" && threads.length === 0) {
    return <p className="px-3 py-2 text-xs text-destructive">Could not load threads.</p>;
  }

  return (
    <nav aria-label="Projects" className="flex flex-col gap-3 px-2 pb-4 pt-1">
      <div className="flex items-center gap-1.5">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setQuery("");
        }}
        placeholder="Filter threads…"
        aria-label="Filter threads"
        className="h-7 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary"
      />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortMode)}
          aria-label="Sort"
          className="h-7 shrink-0 rounded-md border border-border bg-transparent px-1 text-xs text-foreground outline-none focus-visible:border-primary"
        >
          <option value="activity-desc">Newest</option>
          <option value="activity-asc">Oldest</option>
          <option value="name-asc">A to Z</option>
          <option value="name-desc">Z to A</option>
        </select>
      </div>
      {isFiltering && filtered.length === 0 ? (
        <p className="px-1.5 text-xs text-muted-foreground">No matches</p>
      ) : null}
      {filtered.map((node) => (
        <ProjectGroup
          key={node.project.id}
          node={node}
          isCollapsed={!isFiltering && collapsed.has(node.project.id)}
          collapsed={isFiltering ? noCollapsed : collapsed}
          onToggle={toggle}
          now={now}
          listProps={props}
        />
      ))}
    </nav>
  );
}

function HoverButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
    >
      <Icon name={icon} className="size-3.5" aria-hidden />
    </button>
  );
}

function ProjectGroup({
  node,
  isCollapsed,
  collapsed,
  onToggle,
  now,
  listProps,
}: {
  node: ProjectNode;
  isCollapsed: boolean;
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  now: number;
  listProps: PluginThreadListProps;
}) {
  const actions = experimental_useSidebarThreadActions();
  const { project, workspaces } = node;
  const isActive = project.id === listProps.activeProjectId;

  return (
    <section>
      <div className="group/row flex h-7 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent/50">
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={() => onToggle(project.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon
            name={project.isPersonal ? "UserRound" : "Folder"}
            className={cn("size-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
            aria-hidden
          />
          <span className="truncate text-sm font-semibold text-foreground">
            {project.isPersonal ? "Personal" : project.name}
          </span>
          {isCollapsed && node.threadCount > 0 ? (
            <span className="text-xs text-muted-foreground">{node.threadCount}</span>
          ) : null}
        </button>
        <HoverButton
          label={`New thread in ${project.name}`}
          icon="Plus"
          onClick={() => {
            actions.openNewThread({ projectId: project.id, focusPrompt: true });
            listProps.onNavigate();
          }}
        />
      </div>
      {isCollapsed ? null : (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {workspaces.length === 0 ? (
            <p className="py-1 pl-7 text-xs text-muted-foreground">No threads</p>
          ) : (
            workspaces.map((workspace) => (
              <WorkspaceGroup
                key={workspace.key}
                projectId={project.id}
                workspace={workspace}
                isCollapsed={collapsed.has(workspace.key)}
                onToggle={onToggle}
                now={now}
                listProps={listProps}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function WorkspaceGroup({
  projectId,
  workspace,
  isCollapsed,
  onToggle,
  now,
  listProps,
}: {
  projectId: string;
  workspace: WorkspaceNode;
  isCollapsed: boolean;
  onToggle: (key: string) => void;
  now: number;
  listProps: PluginThreadListProps;
}) {
  const actions = experimental_useSidebarThreadActions();
  // Every thread in a workspace shares its branch, so any one finds the PR.
  const firstThreadId = workspace.threads[0]?.thread.id ?? "";
  const { pullRequest } = experimental_useSidebarThreadPullRequest(firstThreadId);
  const containsActive = workspace.threads.some(
    ({ thread }) => thread.id === listProps.activeThreadId,
  );
  const sdk = useSdk();
  const [isEditing, setIsEditing] = useState(false);
  // Shown until the sidebar data catches up with the saved name.
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  useEffect(() => {
    if (pendingLabel !== null && workspace.label === pendingLabel) setPendingLabel(null);
  }, [pendingLabel, workspace.label]);
  const label = pendingLabel ?? workspace.label;
  const environmentId = workspace.environmentId;

  const rename = (name: string | null) => {
    setIsEditing(false);
    if (name === null || name === label || environmentId === null) return;
    setPendingLabel(name);
    sdk.environments.update({ environmentId, name }).catch((error: unknown) => {
      setPendingLabel(null);
      toast.error(
        `Could not rename workspace: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  return (
    <div>
      <div
        className={cn(
          "group/row flex h-7 items-center gap-1.5 rounded-md pl-4 pr-1.5 hover:bg-accent/50",
          containsActive && isCollapsed && "bg-accent",
        )}
      >
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon name="GitBranch" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <RenameInput initial={label} label="Workspace name" onDone={rename} />
          </div>
        ) : (
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={() => onToggle(workspace.key)}
          title={workspace.branchName && workspace.branchName !== label ? workspace.branchName : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon
            name={pullRequest ? pullRequestIcon(pullRequest) : "GitBranch"}
            fallback="GitBranch"
            className={cn("size-3.5 shrink-0", pullRequest ? pullRequestTone(pullRequest) : "text-muted-foreground")}
            aria-hidden
          />
          <span
            onDoubleClick={(event) => {
              if (environmentId === null) return;
              event.preventDefault();
              event.stopPropagation();
              setIsEditing(true);
            }}
            className="truncate font-mono text-[13px] text-foreground"
          >
            {label}
          </span>
          {workspace.isPrimary ? (
            <span className="shrink-0 rounded border border-border px-1 font-mono text-[10px] leading-4 text-muted-foreground">
              primary
            </span>
          ) : null}
        </button>
        )}
        {pullRequest && !isEditing ? <PullRequestBadge pullRequest={pullRequest} /> : null}
        {environmentId && !isEditing ? (
          <HoverButton label="Rename workspace" icon="Edit" onClick={() => setIsEditing(true)} />
        ) : null}
        {environmentId && !isEditing ? (
          <HoverButton
            label={`New thread in ${label}`}
            icon="Plus"
            onClick={() => {
              actions.openNewThread({
                projectId,
                environmentId: workspace.environmentId ?? undefined,
                focusPrompt: true,
              });
              listProps.onNavigate();
            }}
          />
        ) : null}
      </div>
      {isCollapsed ? null : (
        <ul className="flex flex-col">
          {workspace.threads.map((node) => (
            <ThreadRow
              key={node.thread.id}
              node={node}
              isActive={node.thread.id === listProps.activeThreadId}
              now={now}
              onNavigate={listProps.onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function pullRequestIcon(pr: PluginSidebarPullRequest): string {
  switch (pr.state) {
    case "merged":
      return "GitMerge";
    case "closed":
      return "GitPullRequestClosed";
    case "draft":
      return "GitPullRequestDraft";
    default:
      return "GitPullRequest";
  }
}

function pullRequestTone(pr: PluginSidebarPullRequest): string {
  switch (pr.attention) {
    case "checks_failed":
    case "conflicts":
    case "changes_requested":
    case "blocked":
      return "text-destructive";
    case "ready_to_merge":
    case "review_requested":
      return "text-primary";
    default:
      return "text-muted-foreground";
  }
}

function PullRequestBadge({ pullRequest }: { pullRequest: PluginSidebarPullRequest }) {
  return (
    <a
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer"
      title={`#${pullRequest.number} ${pullRequest.title}`}
      onClick={(event) => event.stopPropagation()}
      className={cn("shrink-0 font-mono text-[11px] hover:underline", pullRequestTone(pullRequest))}
    >
      #{pullRequest.number}
    </a>
  );
}

function ThreadRow({
  node,
  isActive,
  now,
  onNavigate,
}: {
  node: ThreadNode;
  isActive: boolean;
  now: number;
  onNavigate: () => void;
}) {
  const { thread, depth } = node;
  const actions = experimental_useSidebarThreadActions();
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const [isEditing, setIsEditing] = useState(false);
  const currentTitle = thread.title ?? thread.displayTitle;
  const rowPadding = { paddingLeft: `${28 + depth * 14}px` };

  if (isEditing) {
    return (
      <li>
        <div
          style={rowPadding}
          className="flex h-7 items-center gap-1.5 rounded-md bg-accent pr-1.5 text-[13px]"
        >
          <StatusGlyph thread={thread} />
          <RenameInput
            initial={currentTitle}
            onDone={(title) => {
              setIsEditing(false);
              if (title === null || title === currentTitle) return;
              actions.rename(thread.id, title).catch((error: unknown) => {
                toast.error(
                  `Could not rename thread: ${error instanceof Error ? error.message : String(error)}`,
                );
              });
            }}
          />
        </div>
      </li>
    );
  }

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      actions.open(thread.id, { split: true });
    }
    // A plain click follows href; the host routes it in place.
    onNavigate();
  };

  return (
    <li>
      <ThreadHoverCard thread={thread} disabled={false}>
      <a
        {...splitProps}
        href={thread.href}
        onClick={onClick}
        aria-label={thread.displayTitle}
        aria-current={isActive ? "page" : undefined}
        aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        style={rowPadding}
        className={cn(
          "group/row flex h-7 items-center gap-1.5 rounded-md pr-1.5 text-[13px]",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          thread.isUnread && !isActive && "text-foreground",
        )}
      >
        <StatusGlyph thread={thread} />
        <span
          onDoubleClick={(event) => {
            event.preventDefault();
            setIsEditing(true);
          }}
          className={cn("min-w-0 flex-1 truncate", thread.isUnread && "font-medium")}
        >
          <ThreadTitle threadId={thread.id} />
        </span>
        {thread.isPinned ? (
          <Icon name="Pin" className="size-3 shrink-0 text-muted-foreground group-hover/row:hidden" aria-label="Pinned" />
        ) : null}
        {shortcut ? (
          <kbd className="shrink-0 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
            {shortcut.label}
          </kbd>
        ) : (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground group-hover/row:hidden">
            {formatAge(thread.updatedAt, now)}
          </span>
        )}
        <span className="hidden items-center group-hover/row:flex">
          <HoverButton
            label={thread.isPinned ? "Unpin" : "Pin"}
            icon={thread.isPinned ? "PinOff" : "Pin"}
            onClick={() => void actions.setPinned(thread.id, !thread.isPinned)}
          />
          <HoverButton
            label="Archive"
            icon="Archive"
            onClick={() => actions.archive(thread.id)}
          />
        </span>
      </a>
      </ThreadHoverCard>
    </li>
  );
}

/**
 * Inline title editor. Enter or blur saves, Escape cancels. Reports the
 * trimmed title, or null when cancelled or left empty.
 */
function RenameInput({
  initial,
  label = "Thread title",
  onDone,
}: {
  initial: string;
  label?: string;
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [finished, setFinished] = useState(false);
  const finish = (title: string | null) => {
    // Enter blurs the input as it unmounts; save only once.
    if (finished) return;
    setFinished(true);
    onDone(title);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish(value.trim() || null);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(null);
    }
  };
  return (
    <input
      autoFocus
      aria-label={label}
      value={value}
      maxLength={200}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(value.trim() || null)}
      onFocus={(event) => event.target.select()}
      className="min-w-0 flex-1 rounded border border-border bg-background px-1 text-[13px] text-foreground outline-none focus:border-ring"
    />
  );
}

const SPINNING_INDICATORS = new Set<PluginSidebarThreadIndicator>([
  "runtime",
  "working-draft",
  "workflow",
  "background-agent",
  "background-command",
  "plan-mode",
  "goal",
]);

/** bb's resolved indicator as a small glyph. Unknown kinds fall back to a dot. */
function StatusGlyph({ thread }: { thread: PluginSidebarThread }) {
  const { hasUnsubmittedDraft } = useSidebarThreadDraft(thread.id);
  const label = thread.indicatorLabel ?? undefined;
  const indicator = thread.indicator;
  let glyph: ReactNode;

  if (indicator === "waiting-for-input") {
    glyph = <Icon name="CircleQuestion" className="size-3.5 text-primary" aria-label={label} />;
  } else if (indicator === "unread-error" || indicator === "queued-failed") {
    glyph = <Icon name="CircleX" className="size-3.5 text-destructive" aria-label={label} />;
  } else if (SPINNING_INDICATORS.has(indicator) || isBusy(thread)) {
    glyph = <Icon name="Loading" className="size-3.5 animate-spin text-primary" aria-label={label} />;
  } else if (indicator === "queued-waiting") {
    glyph = <Icon name="Clock" className="size-3.5 text-muted-foreground" aria-label={label} />;
  } else if (indicator === "draft" || hasUnsubmittedDraft) {
    glyph = <Icon name="Edit" className="size-3 text-muted-foreground" aria-label={label ?? "Draft"} />;
  } else if (indicator === "unread-success") {
    glyph = <span aria-label={label} role="img" className="size-1.5 rounded-full bg-primary" />;
  } else {
    glyph = <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/40" />;
  }

  return <span className="flex size-3.5 shrink-0 items-center justify-center">{glyph}</span>;
}

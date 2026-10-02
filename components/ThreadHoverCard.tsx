// A details card that opens beside a thread row on hover: project, machine,
// branch, model, status, and the branch's pull request.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  experimental_useProviders,
  experimental_useSidebarThreadPullRequest,
  experimental_useSidebarThreads,
  useSdk,
  type PluginSidebarPullRequest,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 200;
/** Fired when a card opens so any other open card closes. */
const CARD_OPENED = "worktt:hover-card-opened";

export function ThreadHoverCard({
  thread,
  disabled,
  children,
}: {
  thread: PluginSidebarThread;
  disabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const portalProps = usePortalScopeProps();
  const visible = open && !disabled;

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  const cancel = () => clearTimeout(timer.current);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!visible) return;
    document.dispatchEvent(new Event(CARD_OPENED));
    const closeForAnother = () => setOpen(false);
    // Registered after dispatching, so this card ignores its own event.
    document.addEventListener(CARD_OPENED, closeForAnother);
    return () => document.removeEventListener(CARD_OPENED, closeForAnother);
  }, [visible]);

  return (
    <Popover.Root open={visible} onOpenChange={setOpen} modal={false}>
      <Popover.Anchor asChild>
        <div
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") schedule(true, OPEN_DELAY_MS);
          }}
          onPointerLeave={() => schedule(false, CLOSE_DELAY_MS)}
          // Clicking the row navigates; the card would only get in the way.
          onPointerDown={() => {
            cancel();
            setOpen(false);
          }}
        >
          {children}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          {...portalProps}
          side="right"
          align="start"
          sideOffset={8}
          aria-label="Thread details"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={cancel}
          onPointerLeave={() => schedule(false, CLOSE_DELAY_MS)}
          className="z-50 w-72 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl outline-none"
        >
          <ThreadDetails thread={thread} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface Execution {
  model: string;
  reasoningLevel: string | null;
}

/** The thread's model and reasoning level, fetched once per card opening. */
function useExecution(threadId: string): Execution {
  const sdk = useSdk();
  const [execution, setExecution] = useState<Execution>({ model: "Loading…", reasoningLevel: null });
  useEffect(() => {
    const controller = new AbortController();
    sdk.threads.defaultExecutionOptions({ threadId, signal: controller.signal }).then(
      (options) =>
        setExecution(
          options
            ? { model: options.model, reasoningLevel: options.reasoningLevel }
            : { model: "Model not set", reasoningLevel: null },
        ),
      () => {
        if (!controller.signal.aborted) setExecution({ model: "Model unavailable", reasoningLevel: null });
      },
    );
    return () => controller.abort();
  }, [sdk, threadId]);
  return execution;
}

function statusLabel(thread: PluginSidebarThread): string {
  if (thread.hasPendingInteraction) return "Needs you";
  return thread.indicatorLabel ?? "Idle";
}

function ThreadDetails({ thread }: { thread: PluginSidebarThread }) {
  const { projects } = experimental_useSidebarThreads();
  const { providers } = experimental_useProviders();
  const { pullRequest, isLoading } = experimental_useSidebarThreadPullRequest(thread.id);
  const execution = useExecution(thread.id);
  const project = projects.find((entry) => entry.id === thread.projectId);
  const provider = providers.find((entry) => entry.id === thread.providerId);
  const reasoning = execution.reasoningLevel
    ? (provider?.reasoningLevels?.find((level) => level.id === execution.reasoningLevel)?.label ??
      execution.reasoningLevel)
    : null;
  const env = thread.environment;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="line-clamp-2 text-[13px] font-semibold leading-snug">{thread.displayTitle}</div>
      <div className="flex flex-col gap-1.5 text-muted-foreground">
        {project ? (
          <DetailRow icon={project.isPersonal ? "UserRound" : "Folder"} label="Project">
            {project.isPersonal ? "Personal" : project.name}
          </DetailRow>
        ) : null}
        {thread.host ? (
          <DetailRow icon="Laptop" label="Machine">
            {thread.host.name}
          </DetailRow>
        ) : null}
        {env?.branchName ? (
          <DetailRow icon={env.isWorktree ? "FolderGit" : "GitBranch"} label="Branch">
            <span className="font-mono">{env.branchName}</span>
          </DetailRow>
        ) : null}
        <DetailRow icon="Bot" label="Model">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-popover-foreground">{execution.model}</span>
            <span className="truncate text-[11px]">
              {provider?.displayName ?? thread.providerId}
              {reasoning ? ` · ${reasoning}` : null}
            </span>
          </span>
        </DetailRow>
        <DetailRow icon="CircleDot" label="Status">
          {statusLabel(thread)}
        </DetailRow>
      </div>
      {pullRequest ? (
        <PullRequestDetails pullRequest={pullRequest} />
      ) : isLoading && env?.branchName ? (
        <div className="text-muted-foreground">Checking for a pull request…</div>
      ) : null}
    </div>
  );
}

function DetailRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon name={icon} className="mt-px size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

const ATTENTION_LABELS: Record<PluginSidebarPullRequest["attention"], string> = {
  blocked: "Blocked",
  changes_requested: "Changes requested",
  checks_failed: "Checks failed",
  checks_pending: "Checks running",
  closed: "Closed",
  conflicts: "Has conflicts",
  draft: "Draft",
  merged: "Merged",
  none: "Open",
  ready_to_merge: "Ready to merge",
  review_requested: "Review requested",
};

function attentionTone(attention: PluginSidebarPullRequest["attention"]): string {
  switch (attention) {
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

function PullRequestDetails({ pullRequest }: { pullRequest: PluginSidebarPullRequest }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-2.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon name="GitPullRequest" className="size-3.5 shrink-0" aria-hidden />
        <span>Pull request</span>
      </div>
      <a
        href={pullRequest.url}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-baseline gap-1.5 pl-5.5 hover:underline"
      >
        <span className={cn("shrink-0 font-mono", attentionTone(pullRequest.attention))}>
          #{pullRequest.number}
        </span>
        <span className="truncate">{pullRequest.title}</span>
      </a>
      <span className={cn("pl-5.5 text-[11px]", attentionTone(pullRequest.attention))}>
        {ATTENTION_LABELS[pullRequest.attention] ?? pullRequest.attention}
      </span>
    </div>
  );
}

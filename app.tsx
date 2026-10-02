// bb-plugin-worktt — replaces the sidebar thread list with a worktree
// tree: projects, then workspaces (primary checkout and worktrees), then the
// threads in each workspace.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { WorkTT } from "@/components/WorkTT";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "worktt",
    title: "WorkTT",
    description: "Projects, then worktrees, then the threads in each worktree.",
    component: WorkTT,
  });
});

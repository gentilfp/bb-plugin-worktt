Group your sidebar by where the work happens: each project, the worktrees
inside it, and the agent threads running in each worktree.

## What you get

- Projects as collapsible groups, with a button to start a thread in one.
- The primary checkout and each worktree as a row with its branch name, a
  "primary" badge, and the pull request number when the branch has one.
- Threads under their worktree with a live status glyph and how long ago they
  changed. Hover a thread to pin or archive it.

## How it works

The list reads bb's own sidebar data, so nothing leaves the machine. Collapsed
groups are remembered per client. Pick it under Settings, Appearance, Sidebar.

# WorkTT

WorkTT (Worktree Tree) is a bb sidebar thread list. It groups threads by
project, then by workspace (the primary checkout and each worktree), then
lists the threads in each workspace.

## Develop

```
npm install --include=dev
bb plugin install .
bb plugin dev
```

Then pick **WorkTT** under Settings, Appearance, Sidebar.

## Layout

- `app.tsx` registers the thread list slot.
- `components/WorkTT.tsx` renders the project, workspace, and thread rows.
- `lib/tree.ts` groups and sorts threads; it has no React or runtime imports.
- `server.ts` is an empty backend entry, which the manifest requires.

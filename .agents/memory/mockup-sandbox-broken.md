---
name: mockup-sandbox is pre-broken
description: The mockup-sandbox artifact fails typecheck and its workflow independently of feature work
---

`artifacts/mockup-sandbox` (the design "Canvas" artifact) fails both:
- `pnpm run typecheck` → `error TS2688: Cannot find type definition file for 'vite/client'`
- its workflow → `Cannot find module '.../mockup-sandbox/node_modules/vite/bin/vite.js'`

Both stem from missing/incomplete vite install in that package, **not** from
any feature code. The other artifacts (api-server, quran-tracker) and scripts
typecheck cleanly.

**How to apply:** when validating a task, treat a green typecheck for
api-server + quran-tracker + scripts as success and ignore the mockup-sandbox
failure. Don't try to fix it unless the task is specifically about that
artifact.

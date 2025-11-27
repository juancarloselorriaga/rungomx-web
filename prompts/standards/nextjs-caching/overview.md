# Next.js Caching Overview

Purpose: orient AI agents on the Next.js 16 caching model and how this doc set is organized. Start here, then jump to the indexed topic that fits your scenario.

Core ideas:
- Four caches exist and are independent: Request Memoization, Data Cache, Full Route Cache, Router Cache.
- Dynamic routes (headers/cookies/searchParams) disable Full Route Cache but Data Cache still works via `fetch`, `'use cache: remote'`, or `'use cache: private'`.
- Choose the cache directive based on whether you need dynamic APIs and whether data is shared or per-user.
- Always tag cached data and revalidate on writes; prefer `revalidateTag` over broad `revalidatePath`.

See `prompts/standards/nextjs-caching-index.md` to pick the smallest topic file you need.

# Next.js 16 Caching Rules (Routing Stub)

The former monolithic guide is now split into topic cards to keep prompts lean.

Usage for AI agents:
1) Start with `prompts/standards/nextjs-caching-index.md`.
2) Select the 1–2 relevant topic files (max 2 unless explicitly needed).
3) Load only those files; each begins with a mini-summary and deep links via headings.

Topic cards:
- `prompts/standards/nextjs-caching/overview.md`
- `prompts/standards/nextjs-caching/caching-mechanisms.md`
- `prompts/standards/nextjs-caching/critical-rules.md`
- `prompts/standards/nextjs-caching/directives.md`
- `prompts/standards/nextjs-caching/protected-routes.md`
- `prompts/standards/nextjs-caching/proxy-vs-layout-auth.md`
- `prompts/standards/nextjs-caching/invalidation-revalidation.md`
- `prompts/standards/nextjs-caching/patterns.md`
- `prompts/standards/nextjs-caching/checklist.md`
- `prompts/standards/nextjs-caching/quick-reference.md`

Quick defaults (for fast recall): dynamic APIs in layouts disable Full Route Cache but **Data Cache still works** via `fetch`, `'use cache: remote'`, or `'use cache: private'`; always tag data and prefer `revalidateTag` over broad `revalidatePath`.

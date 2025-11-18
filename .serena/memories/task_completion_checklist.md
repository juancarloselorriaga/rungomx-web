# Task Completion Checklist

When a coding task is completed, follow these steps:

## 1. Code Quality
- [ ] Ensure code follows Prettier formatting rules (printWidth: 100, singleQuote, trailingComma: 'all')
- [ ] Follow established naming conventions (kebab-case files, PascalCase components, camelCase functions)
- [ ] Use `@/` path alias for imports
- [ ] Add `'use client'` directive if component uses client-side features

## 2. TypeScript
- [ ] Ensure no TypeScript errors
- [ ] Use strict typing (strict mode is enabled)
- [ ] Define proper types/interfaces where needed

## 3. Linting
```bash
pnpm lint
```
Fix any linting errors before considering task complete

## 4. Build Check
```bash
pnpm build
```
Ensure the build completes successfully without errors

## 5. File Organization
- [ ] Components in appropriate directory (ui/, auth/, layout/)
- [ ] Constants in `.constants.ts` files where applicable
- [ ] Types in `types.ts` files when needed
- [ ] Follow route group patterns: (auth), (protected), (public)

## 6. Git
- [ ] Stage relevant files only
- [ ] Write clear commit message
- [ ] Review changes before committing

## Optional (if applicable)
- [ ] Update related documentation
- [ ] Test in browser (pnpm dev)
- [ ] Check responsive design
- [ ] Verify theme switching works (if UI component)
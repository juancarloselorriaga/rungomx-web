# Suggested Commands

## Development Commands

### Run development server
```bash
pnpm dev
```
Opens development server at http://localhost:3000

### Build for production
```bash
pnpm build
```

### Start production server
```bash
pnpm start
```

### Linting
```bash
pnpm lint
```
Runs ESLint with Next.js TypeScript config

### Add shadcn/ui components
```bash
pnpm shadcn
```

## Git Commands (Darwin/macOS)
Standard git commands work on macOS:
```bash
git status
git add .
git commit -m "message"
git push
git pull
```

## File System Commands (Darwin/macOS)
```bash
ls              # List directory contents
ls -la          # List with details including hidden files
cd <path>       # Change directory
find . -name    # Find files by name
grep -r         # Search in files recursively
cat             # Display file contents
head            # Show first lines of file
tail            # Show last lines of file
```

## Package Management
```bash
pnpm install           # Install dependencies
pnpm add <package>     # Add dependency
pnpm add -D <package>  # Add dev dependency
pnpm remove <package>  # Remove dependency
```
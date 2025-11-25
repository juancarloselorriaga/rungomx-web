# Project Overview

## Purpose
RunGoMX is a web application platform for creating, managing, and promoting races and sporting events in Mexico. It's an all-in-one platform for race organization including registrations, payments, results, rankings, and more.

## Tech Stack
- **Framework**: Next.js 16.0.3 (React 19.2.0)
- **Language**: TypeScript 5.x with strict mode enabled
- **Styling**: Tailwind CSS 4.x
- **UI Components**: Radix UI components (avatar, dialog, dropdown-menu, slot, tooltip)
- **Theme**: next-themes for dark/light mode support
- **Icons**: lucide-react
- **Package Manager**: pnpm
- **Linting**: ESLint with Next.js config
- **Formatting**: Prettier

## Project Structure
```
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth routes (sign-in, sign-up)
│   ├── (protected)/       # Protected routes (dashboard, settings, profile, team, projects)
│   ├── (public)/          # Public routes (home, about, contact, events, news, results, help)
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── auth/             # Authentication components
│   ├── layout/           # Layout components (navigation, footer)
│   ├── providers/        # Context providers (theme)
│   └── ui/               # shadcn/ui components
├── config/               # Configuration files
├── hooks/                # Custom React hooks (empty currently)
├── lib/                  # Library utilities (auth, utils)
├── types/                # TypeScript type definitions
├── utils/                # Utility functions (capitalize, seo)
└── proxy.ts              # Middleware for route protection
```

## Key Features
- Route-based layout groups: (auth), (protected), (public)
- Authentication system (in development - currently stubbed)
- Theme switching (light/dark mode)
- Responsive navigation with drawer for mobile
- SEO optimization with metadata
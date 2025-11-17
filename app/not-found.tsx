import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
  return (
    <div
      className="w-full relative flex h-screen items-center justify-center overflow-hidden">
      {/* Background pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="not-found-pattern"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="20" cy="20" r="1" fill="currentColor"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#not-found-pattern)"/>
        </svg>
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto max-w-2xl px-4 py-16 text-center">


        <div className="mb-4">
          <p className="text-6xl font-bold tracking-tight sm:text-7xl">404</p>
        </div>

        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Page Not Found
        </h1>

        <p className="mb-8 text-lg text-foreground/80">
          Sorry, we couldn&#39;t find the page you&#39;re looking for. The page may
          have been moved, deleted, or the URL might be incorrect.
        </p>

        <div className="mb-8 rounded-lg bg-white/10 p-6 backdrop-blur-sm">
          <p className="text-sm text-foreground/90">
            <strong>Here are some helpful links:</strong>
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground/80">
            <li>• Check the URL for typos</li>
            <li>• Use the navigation menu to find what you need</li>
            <li>• Return to the home page and start fresh</li>
          </ul>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            size="lg"
            variant="default"
          >
            <Link href="/">
              <Home className="mr-2 h-5 w-5"/>
              Go Home
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
          >
            <Link href="/about">
              Learn About Us
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

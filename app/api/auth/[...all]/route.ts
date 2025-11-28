import { auth } from "@/lib/auth";
import { APIError } from "better-auth/api";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

const handler = toNextJsHandler(auth.handler);

const withErrorHandling = (fn: (request: Request) => Promise<Response>) => {
  return async (request: Request) => {
    try {
      return await fn(request);
    } catch (error) {
      if (error instanceof APIError) {
        // Avoid user enumeration: collapse 404 from auth endpoints into a generic 401.
        const rawStatus = typeof error.status === "string" ? Number.parseInt(error.status, 10) : error.status;
        const normalizedStatus = rawStatus === 404 ? 401 : rawStatus ?? 401;
        const status = Number.isFinite(normalizedStatus) ? normalizedStatus : 401;
        const message = status === 401 ? "Invalid email or password" : error.message ?? "Authentication failed";
        return NextResponse.json({ error: message }, { status });
      }

      console.error("Unhandled auth error", error);
      return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
    }
  };
};

export const GET = withErrorHandling(handler.GET);
export const POST = withErrorHandling(handler.POST);
export const PATCH = withErrorHandling(handler.PATCH);
export const PUT = withErrorHandling(handler.PUT);
export const DELETE = withErrorHandling(handler.DELETE);

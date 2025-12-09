import { customSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
});

export const { signIn, signOut, signUp, useSession } = authClient;

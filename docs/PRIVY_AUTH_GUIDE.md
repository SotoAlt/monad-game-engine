# Privy Authentication Architecture Guide

> Complete implementation reference extracted from QBOTS Arena production codebase.
> For use in Three.js game project with PostgreSQL, Hetzner, and Docker.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Privy Dashboard Setup](#2-privy-dashboard-setup)
3. [NPM Dependencies](#3-npm-dependencies)
4. [Environment Variables](#4-environment-variables)
5. [Frontend: Privy Provider Setup](#5-frontend-privy-provider-setup)
6. [Frontend: Auth Context & Token Exchange](#6-frontend-auth-context--token-exchange)
7. [Frontend: Login Page & Flow](#7-frontend-login-page--flow)
8. [Frontend: Route Protection](#8-frontend-route-protection)
9. [Frontend: User Identity & Wallet](#9-frontend-user-identity--wallet)
10. [Backend: Privy Token Verification](#10-backend-privy-token-verification)
11. [Backend: JWT Middleware](#11-backend-jwt-middleware)
12. [Backend: Auth Route (Token Exchange)](#12-backend-auth-route-token-exchange)
13. [Backend: User Service (Upsert)](#13-backend-user-service-upsert)
14. [Backend: WebSocket Authentication](#14-backend-websocket-authentication)
15. [Database: Prisma Schema](#15-database-prisma-schema)
16. [Database: Prisma Client Setup](#16-database-prisma-client-setup)
17. [Solana Wallet Integration](#17-solana-wallet-integration)
18. [Deployment: Docker](#18-deployment-docker)
19. [Deployment: Nginx & SSL](#19-deployment-nginx--ssl)
20. [Deployment: Scripts & Commands](#20-deployment-scripts--commands)
21. [Security Checklist](#21-security-checklist)
22. [Step-by-Step Implementation Guide](#22-step-by-step-implementation-guide)

---

## 1. Architecture Overview

The system uses a **two-layer authentication** model:

```
                         ┌─────────────────────┐
                         │   Privy Dashboard    │
                         │  (app ID + secret)   │
                         └──────────┬──────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
   ┌──────▼──────┐          ┌──────▼──────┐          ┌──────▼──────┐
   │   Frontend   │          │   Backend    │          │  PostgreSQL  │
   │  (Next.js)   │          │  (Express)   │          │  (Prisma)    │
   │              │          │              │          │              │
   │ PrivyProvider│──token──▶│ verifyPrivy  │──upsert─▶│ User table   │
   │ usePrivy()   │          │ Token()      │          │ privyUserId  │
   │ getAccess    │◀─JWT─────│ signToken()  │          │ walletAddr   │
   │ Token()      │          │ requireAuth  │          │ displayName  │
   └──────────────┘          └──────────────┘          └──────────────┘

Layer 1: Privy handles Twitter/X OAuth → returns Privy access token (JWT)
Layer 2: Backend verifies Privy token → issues internal JWT (7-day expiry)
```

**Why two layers?**
- Privy tokens are short-lived and tied to Privy's infrastructure
- Internal JWT gives you full control over session duration and payload
- Backend can add custom claims, enforce invite codes, etc.

---

## 2. Privy Dashboard Setup

1. Create account at https://dashboard.privy.io
2. Create a new app
3. Configure:
   - **Login Methods**: Enable Twitter/X (or email, phone, wallet — whatever you need)
   - **Embedded Wallets**: Enable Solana embedded wallets (creates wallet on login)
   - **Allowed Origins**: Add your domains (localhost:3000 for dev, yourdomain.com for prod)
4. Copy:
   - `App ID` → `NEXT_PUBLIC_PRIVY_APP_ID` (frontend) and `PRIVY_APP_ID` (backend)
   - `App Secret` → `PRIVY_APP_SECRET` (backend only, never expose to frontend)

---

## 3. NPM Dependencies

### Frontend (Next.js / React)
```json
{
  "dependencies": {
    "@privy-io/react-auth": "^3.10.2",
    "@solana/web3.js": "^1.98.4",
    "@solana/spl-token": "^0.4.14",
    "bs58": "^6.0.0",
    "socket.io-client": "^4.8.1"
  }
}
```

### Backend (Express)
```json
{
  "dependencies": {
    "@privy-io/server-auth": "^1.14.0",
    "@prisma/client": "^5.22.0",
    "jsonwebtoken": "^9.0.2",
    "express": "^4.21.1",
    "cors": "^2.8.5",
    "socket.io": "^4.8.1",
    "zod": "^3.23.8",
    "prisma": "^5.22.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.7",
    "@types/express": "^5.0.0"
  }
}
```

---

## 4. Environment Variables

### Frontend (.env.local)
```bash
# Privy
NEXT_PUBLIC_PRIVY_APP_ID=clxxxxxxxxxxxxxxxxxx

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:4001

# Solana (optional, for wallet/payments)
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_TREASURY_ADDRESS=<your-treasury-pubkey>

# Helius RPC (optional, better Solana RPC)
NEXT_PUBLIC_HELIUS_API_KEY=<optional>
```

### Backend (.env)
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5433/mydb"

# Auth
JWT_SECRET="min-32-character-secret-key-here-change-in-production"
PRIVY_APP_ID=clxxxxxxxxxxxxxxxxxx
PRIVY_APP_SECRET=<your-privy-app-secret>

# Server
PORT=4001
NODE_ENV=development

# Solana (optional)
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
TREASURY_WALLET_ADDRESS=<your-treasury-pubkey>
TREASURY_PRIVATE_KEY=<base58-encoded-private-key>
```

### Backend Environment Validation (Zod)
```typescript
// src/env.ts
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(4001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);
```

---

## 5. Frontend: Privy Provider Setup

Wrap your entire app with `PrivyProvider` at the root level.

```tsx
// src/app/providers.tsx
"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { AuthProvider } from "@/contexts/AuthContext";

// External wallet connectors (Phantom, etc.)
const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        // Which login methods to show
        loginMethods: ["twitter"],

        appearance: {
          theme: "dark",
          accentColor: "#0ea5e9",
          logo: "/your-logo.png",
          walletChainType: "solana-only",
        },

        // Solana RPC configuration
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
            },
            "solana:devnet": {
              rpc: createSolanaRpc("https://api.devnet.solana.com"),
            },
          },
        },

        // Auto-create embedded Solana wallet on login
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },

        // External wallet support (Phantom, etc.)
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      <AuthProvider>
        {children}
      </AuthProvider>
    </PrivyProvider>
  );
}
```

```tsx
// src/app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

## 6. Frontend: Auth Context & Token Exchange

This is the core of the two-layer auth. The `AuthContext` handles:
1. Getting Privy access token
2. Exchanging it for a backend JWT
3. Storing the backend JWT for API calls
4. Fetching initial user data

```tsx
// src/contexts/AuthContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { usePrivy } from "@privy-io/react-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

// Helper: fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

type UserProfile = {
  id: string;
  privyUserId: string;
  walletAddress: string | null;
  displayName: string | null;
};

type AuthContextType = {
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  user: UserProfile | null;
  authenticate: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = usePrivy();

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Get Privy access token (JWT)
      const privyToken = await getAccessToken();
      if (!privyToken) {
        setError("Failed to get Privy token");
        return false;
      }

      // Step 2: Exchange Privy token for backend JWT
      const authResponse = await fetchWithTimeout(
        `${API_BASE_URL}/api/auth/privy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: privyToken }),
        },
        10000
      );

      if (!authResponse.ok) {
        const err = await authResponse.json().catch(() => ({}));
        setError(err.error || "Authentication failed");
        return false;
      }

      const authData = await authResponse.json();
      const backendToken = authData.token;
      setToken(backendToken);

      // Step 3: Fetch user profile with the new token
      const profileRes = await fetchWithTimeout(
        `${API_BASE_URL}/api/me`,
        { headers: { Authorization: `Bearer ${backendToken}` } },
        10000
      );

      if (profileRes.ok) {
        setUser(await profileRes.json());
      }

      return true;
    } catch (err) {
      setError("Network error during authentication");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/api/me`,
      { headers: { Authorization: `Bearer ${token}` } },
      10000
    );
    if (res.ok) setUser(await res.json());
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        error,
        user,
        authenticate,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
```

---

## 7. Frontend: Login Page & Flow

```tsx
// src/app/login/page.tsx
"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login, ready, authenticated } = usePrivy();
  const { authenticate, isAuthenticated, isLoading, error } = useAuth();
  const router = useRouter();

  // When Privy authenticates, exchange for backend token
  useEffect(() => {
    if (ready && authenticated && !isAuthenticated && !isLoading) {
      authenticate().then((success) => {
        if (success) {
          router.push("/");  // Redirect to home after auth
        }
      });
    }
  }, [ready, authenticated, isAuthenticated, isLoading, authenticate, router]);

  // Already fully authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1>Welcome to My Game</h1>

        {error && <p className="text-red-500">{error}</p>}

        {isLoading ? (
          <p>Authenticating...</p>
        ) : (
          <button
            onClick={login}
            disabled={!ready}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg"
          >
            Sign in with X (Twitter)
          </button>
        )}
      </div>
    </div>
  );
}
```

### Complete Login Flow

```
User clicks "Sign in with X"
         │
         ▼
Privy.login() → Opens Twitter OAuth popup
         │
         ▼
Twitter OAuth completes → Privy sets authenticated=true
         │
         ▼
useEffect fires → calls authenticate()
         │
         ▼
getAccessToken() → Privy JWT (short-lived)
         │
         ▼
POST /api/auth/privy { accessToken: privyJWT }
         │
         ▼
Backend: verifyPrivyToken() → Extract privyUserId, wallet, twitter
         │
         ▼
Backend: upsertUser() → Create or update user in PostgreSQL
         │
         ▼
Backend: signToken(user.id) → Internal JWT (7-day)
         │
         ▼
Frontend stores JWT in AuthContext state
         │
         ▼
GET /api/me → Fetch user profile
         │
         ▼
Redirect to home page
```

---

## 8. Frontend: Route Protection

Protect authenticated routes with a layout guard:

```tsx
// src/app/(app)/layout.tsx
"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "@/contexts/AuthContext";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, authenticated } = usePrivy();
  const { authenticate, isLoading, isAuthenticated, error } = useAuth();

  // Auto-authenticate when Privy is ready
  useEffect(() => {
    if (ready && authenticated && !isAuthenticated && !isLoading) {
      authenticate();
    }
  }, [ready, authenticated, isAuthenticated, isLoading, authenticate]);

  // Redirect to login if not Privy authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      redirect("/login");
    }
  }, [ready, authenticated]);

  // Loading states
  if (!ready || isLoading) return <div>Loading...</div>;
  if (!authenticated) return <div>Redirecting to login...</div>;
  if (error) return <div>Auth error: {error}</div>;
  if (!isAuthenticated) return <div>Authenticating...</div>;

  return <>{children}</>;
}
```

**File structure:**
```
src/app/
  login/page.tsx        ← Public (no auth required)
  (app)/                ← Protected group
    layout.tsx          ← Auth guard
    page.tsx            ← Home (requires auth)
    game/page.tsx       ← Game (requires auth)
    profile/page.tsx    ← Profile (requires auth)
```

---

## 9. Frontend: User Identity & Wallet

Extract Twitter identity and wallet from Privy:

```tsx
import { usePrivy, useWallets } from "@privy-io/react-auth";

function UserProfile() {
  const { user: privyUser, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();

  // Twitter identity
  const twitterUser = privyUser?.twitter;
  const twitterUsername = twitterUser?.username;       // e.g., "johndoe"
  const twitterAvatar = twitterUser?.profilePictureUrl;

  // Solana wallet (embedded, auto-created by Privy)
  const solanaWallet = wallets[0];
  const walletAddress = solanaWallet?.address;

  return (
    <div>
      {twitterAvatar && <img src={twitterAvatar} alt="avatar" />}
      <p>@{twitterUsername}</p>
      <p>Wallet: {walletAddress?.slice(0, 4)}...{walletAddress?.slice(-4)}</p>
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}
```

---

## 10. Backend: Privy Token Verification

The backend uses `@privy-io/server-auth` to verify tokens issued by Privy.

```typescript
// src/auth/privy.ts
import { PrivyClient } from "@privy-io/server-auth";
import { env } from "../env.js";

const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET);

export type PrivyVerificationResult = {
  privyUserId: string;
  walletAddress: string | null;
  displayName: string | null;
  twitterAvatarUrl: string | null;
};

export async function verifyPrivyToken(
  accessToken: string
): Promise<PrivyVerificationResult | null> {
  if (!accessToken || accessToken.trim() === "") {
    return null;
  }

  try {
    // 1. Verify the JWT and get claims
    const verifiedClaims = await privy.verifyAuthToken(accessToken);

    // 2. Fetch full user details from Privy
    const user = await privy.getUser(verifiedClaims.userId);

    // 3. Extract Solana embedded wallet
    const solanaWallet = user.linkedAccounts.find(
      (account): account is Extract<typeof account, { type: "wallet" }> =>
        account.type === "wallet" &&
        "walletClientType" in account &&
        account.walletClientType === "privy" &&
        "chainType" in account &&
        account.chainType === "solana"
    );

    // Fallback to any embedded wallet
    const embeddedWallet =
      solanaWallet ??
      user.linkedAccounts.find(
        (account): account is Extract<typeof account, { type: "wallet" }> =>
          account.type === "wallet" &&
          "walletClientType" in account &&
          account.walletClientType === "privy"
      );

    // 4. Extract Twitter account
    const twitterAccount = user.linkedAccounts.find(
      (account): account is Extract<typeof account, { type: "twitter_oauth" }> =>
        account.type === "twitter_oauth"
    );

    return {
      privyUserId: verifiedClaims.userId,
      walletAddress: embeddedWallet?.address ?? null,
      displayName: twitterAccount?.username ?? null,
      twitterAvatarUrl: twitterAccount?.profilePictureUrl ?? null,
    };
  } catch (error) {
    console.error("Privy verification failed:", error);
    return null;
  }
}
```

---

## 11. Backend: JWT Middleware

Issue and verify your own JWTs for internal session management.

```typescript
// src/auth/middleware.ts
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { Request, Response, NextFunction } from "express";

type JWTPayload = { userId: string };

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

// Sign a new token (7-day expiry)
export function signToken(userId: string): string {
  return jwt.sign({ userId } satisfies JWTPayload, env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// Verify a token
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// Middleware: REQUIRE authentication
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({ error: "Invalid authorization format" });
    return;
  }

  const payload = verifyToken(parts[1]!);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = { id: payload.userId };
  next();
}

// Middleware: OPTIONAL authentication (attach user if present)
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      const payload = verifyToken(parts[1]!);
      if (payload) {
        req.user = { id: payload.userId };
      }
    }
  }
  next();
}
```

---

## 12. Backend: Auth Route (Token Exchange)

This is the endpoint the frontend calls to exchange a Privy token for your internal JWT.

```typescript
// src/users/routes.ts
import { Router, Request, Response } from "express";
import { verifyPrivyToken } from "../auth/privy.js";
import { signToken, requireAuth } from "../auth/middleware.js";
import {
  findUserByPrivyId,
  upsertUserFromPrivy,
  findUserWithRelations,
} from "./service.js";

export const userRoutes = Router();

// POST /api/auth/privy - Exchange Privy token for internal JWT
userRoutes.post("/auth/privy", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;

    // 1. Verify with Privy
    const privyResult = await verifyPrivyToken(accessToken);
    if (!privyResult) {
      res.status(401).json({ error: "Invalid Privy access token" });
      return;
    }

    // 2. Create or update user in database
    const user = await upsertUserFromPrivy(
      privyResult.privyUserId,
      privyResult.walletAddress,
      privyResult.displayName,
      privyResult.twitterAvatarUrl
    );

    // 3. Sign internal JWT with user's DB ID
    const token = signToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        privyUserId: user.privyUserId,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// GET /api/me - Get current user profile (requires auth)
userRoutes.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await findUserWithRelations(userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      privyUserId: user.privyUserId,
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      twitterAvatarUrl: user.twitterAvatarUrl,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});
```

---

## 13. Backend: User Service (Upsert)

The upsert pattern ensures users are created on first login and updated on subsequent logins. Privy is the source of truth for wallet address and Twitter username.

```typescript
// src/users/service.ts
import { prisma } from "../db/client.js";
import type { User } from "@prisma/client";

export async function findUserByPrivyId(
  privyUserId: string
): Promise<User | null> {
  return prisma.user.findUnique({
    where: { privyUserId },
  });
}

export async function upsertUserFromPrivy(
  privyUserId: string,
  walletAddress: string | null,
  displayName: string | null,
  twitterAvatarUrl: string | null = null
): Promise<User> {
  return prisma.user.upsert({
    where: { privyUserId },
    create: {
      privyUserId,
      walletAddress,
      displayName,
      twitterAvatarUrl,
    },
    update: {
      // Update on every login — Privy is source of truth
      walletAddress,
      displayName,
      twitterAvatarUrl,
    },
  });
}

export async function findUserWithRelations(
  userId: string
): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    // Add includes for your relations here
  });
}
```

---

## 14. Backend: WebSocket Authentication

If you use Socket.io for real-time features, authenticate WebSocket connections with the same JWT:

```typescript
// src/websocket/auth.ts
import type { Socket } from "socket.io";
import { verifyToken } from "../auth/middleware.js";

export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  // Client passes JWT in handshake: { auth: { token: "..." } }
  const token = socket.handshake.auth["token"] as string | undefined;

  if (!token) {
    return next(new Error("Authentication required"));
  }

  const payload = verifyToken(token);
  if (!payload) {
    return next(new Error("Invalid or expired token"));
  }

  // Attach userId to socket for use in handlers
  socket.data.userId = payload.userId;
  next();
}

// Usage in server setup:
// io.use(socketAuthMiddleware);
```

Frontend connects with:
```typescript
import { io } from "socket.io-client";

const socket = io("https://api.yourdomain.com", {
  auth: { token: backendJwtToken },
});
```

---

## 15. Database: Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id               String   @id @default(uuid())
  privyUserId      String   @unique              // Privy's user ID
  walletAddress    String?  @unique              // Solana wallet address
  displayName      String?                       // Twitter username (without @)
  twitterAvatarUrl String?                       // Twitter profile picture URL
  isAdmin          Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  // Add your game-specific relations here:
  // gameState  GameState?
  // scores     Score[]
  // inventory  InventoryItem[]
}
```

### Running Migrations

```bash
# Generate Prisma client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name init

# Apply in production (no prompt)
npx prisma migrate deploy
```

---

## 16. Database: Prisma Client Setup

Singleton pattern to prevent multiple instances during hot reload:

```typescript
// src/db/client.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

---

## 17. Solana Wallet Integration

For games that need payments or on-chain transactions.

### Frontend: useWallet Hook

```typescript
// src/hooks/useWallet.ts
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSignAndSendTransaction } from "@privy-io/react-auth/solana";
import { Connection, PublicKey, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import bs58 from "bs58";

const USDC_MINT = {
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

export function useWallet() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const wallet = wallets[0];
  const walletAddress = wallet?.address || null;
  const isConnected = !!wallet && authenticated;

  const sendUSDC = async (to: string, amount: bigint) => {
    if (!wallet) throw new Error("No wallet");

    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const usdcMint = USDC_MINT[network as keyof typeof USDC_MINT];

    const connection = new Connection(rpcUrl);
    const fromPubkey = new PublicKey(wallet.address);
    const toPubkey = new PublicKey(to);
    const mint = new PublicKey(usdcMint);

    const fromATA = await getAssociatedTokenAddress(mint, fromPubkey);
    const toATA = await getAssociatedTokenAddress(mint, toPubkey);

    const instructions = [
      createTransferInstruction(fromATA, toATA, fromPubkey, amount),
    ];

    const { blockhash } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: fromPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    // Privy signs and sends with gas sponsorship
    const result = await signAndSendTransaction({
      transaction: transaction.serialize(),
      wallet,
      options: { sponsor: true },  // Privy pays gas
    });

    return { txSignature: bs58.encode(result.signature) };
  };

  return { walletAddress, isConnected, sendUSDC };
}
```

### Backend: Transaction Verification

```typescript
// src/solana/client.ts
import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "finalized"
);

export async function verifyTransfer(
  txSignature: string,
  expectedRecipient: string,
  expectedAmount: bigint,
  expectedSender: string
): Promise<{ valid: boolean; error?: string }> {
  const tx = await connection.getParsedTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
    commitment: "finalized",
  });

  if (!tx) return { valid: false, error: "Transaction not found" };
  if (tx.meta?.err) return { valid: false, error: "Transaction failed" };

  // Parse SPL token transfer instruction
  const transferInstruction = tx.transaction.message.instructions.find(
    (ix: any) => ix.parsed?.type === "transfer" || ix.parsed?.type === "transferChecked"
  );

  if (!transferInstruction) return { valid: false, error: "No transfer found" };

  const info = (transferInstruction as any).parsed.info;
  // Validate amount, sender, recipient...

  return { valid: true };
}
```

---

## 18. Deployment: Docker

### Backend Dockerfile

```dockerfile
# apps/backend/Dockerfile
FROM node:20-alpine3.18 AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copy monorepo files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/*/package.json ./packages/*/
COPY prisma/ ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN npx prisma generate
RUN pnpm --filter @myapp/backend build

# --- Production stage ---
FROM node:20-alpine3.18

RUN apk add --no-cache dumb-init wget
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D nodejs

WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app .

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/backend/dist/index.js"]
```

### Frontend Dockerfile

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Build args (needed at build time for Next.js)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_SOLANA_NETWORK
ARG NEXT_PUBLIC_SOLANA_RPC_URL

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @myapp/web build

# --- Production stage ---
FROM node:20-alpine

RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 nextjs && adduser -u 1001 -G nextjs -s /bin/sh -D nextjs

WORKDIR /app
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
```

### docker-compose.prod.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: myapp-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: myapp
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: myapp_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myapp -d myapp_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    container_name: myapp-backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://myapp:${POSTGRES_PASSWORD}@postgres:5432/myapp_db
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
      PRIVY_APP_ID: ${PRIVY_APP_ID}
      PRIVY_APP_SECRET: ${PRIVY_APP_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
    ports:
      - "${BACKEND_PORT:-4001}:3000"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    networks:
      - app-network

  frontend:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
        NEXT_PUBLIC_PRIVY_APP_ID: ${PRIVY_APP_ID}
    container_name: myapp-frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    networks:
      - app-network

volumes:
  postgres_data:

networks:
  app-network:
    driver: bridge
```

---

## 19. Deployment: Nginx & SSL

```nginx
# /etc/nginx/sites-available/myapp
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/cloudflare/yourdomain.pem;
    ssl_certificate_key /etc/cloudflare/yourdomain.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/cloudflare/yourdomain.pem;
    ssl_certificate_key /etc/cloudflare/yourdomain.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}

# HTTP redirect
server {
    listen 80;
    server_name yourdomain.com api.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

**SSL with Cloudflare:**
1. In Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate
2. Copy cert to `/etc/cloudflare/yourdomain.pem`
3. Copy key to `/etc/cloudflare/yourdomain.key` (chmod 600)
4. Set SSL mode to "Full (strict)"
5. Enable "Always Use HTTPS" and "WebSockets"

---

## 20. Deployment: Scripts & Commands

### deploy.sh

```bash
#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

case "$1" in
  setup)
    echo -e "${YELLOW}Creating .env.prod from template...${NC}"
    cp .env.example .env.prod
    echo -e "${GREEN}Edit .env.prod with your production values${NC}"
    ;;
  build)
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE build
    ;;
  up)
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
    ;;
  down)
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down
    ;;
  restart)
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
    ;;
  status)
    docker compose -f $COMPOSE_FILE ps
    ;;
  logs)
    docker compose -f $COMPOSE_FILE logs -f ${2:-}
    ;;
  migrate)
    docker compose -f $COMPOSE_FILE exec backend \
      node node_modules/prisma/build/index.js migrate deploy
    ;;
  update)
    echo -e "${YELLOW}Pulling latest code...${NC}"
    git pull origin main
    echo -e "${YELLOW}Building...${NC}"
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE build
    echo -e "${YELLOW}Restarting...${NC}"
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down
    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
    echo -e "${YELLOW}Running migrations...${NC}"
    sleep 5
    docker compose -f $COMPOSE_FILE exec backend \
      node node_modules/prisma/build/index.js migrate deploy
    echo -e "${GREEN}Update complete!${NC}"
    ;;
  *)
    echo "Usage: $0 {setup|build|up|down|restart|status|logs|migrate|update}"
    ;;
esac
```

### First-time deployment:
```bash
ssh root@your-server
cd /opt/myapp
./deploy.sh setup        # Create .env.prod
nano .env.prod           # Fill in production values
./deploy.sh build        # Build Docker images
./deploy.sh up           # Start services
./deploy.sh migrate      # Run database migrations
```

### Update deployment:
```bash
./deploy.sh update       # Pull, build, restart, migrate
```

---

## 21. Security Checklist

- [ ] `PRIVY_APP_SECRET` is NEVER exposed to frontend (backend-only)
- [ ] `JWT_SECRET` is at least 32 characters, randomly generated
- [ ] `TREASURY_PRIVATE_KEY` is only in backend env (never in Docker build args)
- [ ] Frontend uses `NEXT_PUBLIC_` prefix only for safe values
- [ ] Docker containers run as non-root users
- [ ] PostgreSQL password is strong and unique per environment
- [ ] CORS is configured to only allow your frontend domain
- [ ] All authenticated routes use `requireAuth` middleware
- [ ] Privy dashboard "Allowed Origins" matches your domains exactly
- [ ] SSL certificates are properly configured (Full strict mode in Cloudflare)
- [ ] WebSocket connections require JWT in handshake auth
- [ ] Token expiry (7 days) is appropriate for your use case
- [ ] User wallet/displayName updated on every login (Privy as source of truth)
- [ ] Database has unique constraints on `privyUserId` and `walletAddress`

---

## 22. Step-by-Step Implementation Guide

### Phase 1: Privy Dashboard + Frontend Auth

1. **Create Privy app** at dashboard.privy.io
2. **Enable login methods** (Twitter, email, or whatever you need)
3. **Enable Solana embedded wallets** (if needed)
4. **Add allowed origins** (localhost:3000, yourdomain.com)
5. **Install frontend deps**: `pnpm add @privy-io/react-auth`
6. **Create providers.tsx** with `PrivyProvider` (Section 5)
7. **Create AuthContext.tsx** with token exchange logic (Section 6)
8. **Create login page** (Section 7)
9. **Create route protection layout** (Section 8)
10. **Test**: You should be able to log in with Twitter and see Privy user object

### Phase 2: Backend Auth

11. **Install backend deps**: `pnpm add @privy-io/server-auth jsonwebtoken`
12. **Create env.ts** with Zod validation (Section 4)
13. **Create privy.ts** with `verifyPrivyToken()` (Section 10)
14. **Create middleware.ts** with `signToken()`, `requireAuth()` (Section 11)
15. **Create user routes** with `POST /api/auth/privy` (Section 12)
16. **Create user service** with `upsertUserFromPrivy()` (Section 13)
17. **Add CORS** to Express: `app.use(cors({ origin: FRONTEND_URL }))`
18. **Test**: Frontend token exchange should work, `/api/me` returns user

### Phase 3: Database

19. **Set up Prisma**: `npx prisma init`
20. **Define User model** in schema.prisma (Section 15)
21. **Create Prisma client singleton** (Section 16)
22. **Run migration**: `npx prisma migrate dev --name init`
23. **Test**: Users should persist in PostgreSQL after login

### Phase 4: Docker + Deployment

24. **Create Dockerfiles** for frontend and backend (Section 18)
25. **Create docker-compose.prod.yml** (Section 18)
26. **Create deploy.sh** script (Section 20)
27. **Set up Hetzner VPS**: Install Docker, nginx, clone repo
28. **Configure nginx** with SSL (Section 19)
29. **Set up Cloudflare** DNS + origin certificate
30. **Deploy**: `./deploy.sh setup && ./deploy.sh build && ./deploy.sh up && ./deploy.sh migrate`
31. **Update Privy dashboard** with production domain

### Phase 5: Optional - Wallet/Payments

32. **Create useWallet hook** for Solana transactions (Section 17)
33. **Create backend verification** for on-chain tx validation
34. **Add payment models** to Prisma schema (escrow, ledger, etc.)
35. **Implement settlement** and refund logic

---

## Quick Reference: API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/privy` | POST | No | Exchange Privy token for JWT |
| `/api/me` | GET | Required | Get current user profile |
| `/api/health` | GET | No | Health check |

## Quick Reference: Token Lifecycle

| Token | Issuer | Lifetime | Storage | Sent As |
|-------|--------|----------|---------|---------|
| Privy Access Token | Privy | Short (minutes) | Privy SDK (memory) | Body of POST /api/auth/privy |
| Internal JWT | Your backend | 7 days | React state (AuthContext) | `Authorization: Bearer <token>` |
| WebSocket Token | Same JWT | Same | Passed in handshake | `socket.auth.token` |

## Quick Reference: Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Frontend | `providers.tsx` | PrivyProvider config |
| Frontend | `AuthContext.tsx` | Token exchange + state |
| Frontend | `login/page.tsx` | Login UI |
| Frontend | `(app)/layout.tsx` | Route protection |
| Backend | `auth/privy.ts` | Privy SDK verification |
| Backend | `auth/middleware.ts` | JWT sign/verify + Express middleware |
| Backend | `users/routes.ts` | Auth endpoint + profile |
| Backend | `users/service.ts` | User CRUD (upsert) |
| Backend | `websocket/auth.ts` | Socket.io JWT middleware |
| Backend | `env.ts` | Environment validation |
| Database | `schema.prisma` | User model |
| Database | `db/client.ts` | Prisma singleton |
| Deploy | `docker-compose.prod.yml` | Production stack |
| Deploy | `Dockerfile` (x2) | Container images |
| Deploy | `nginx.conf` | Reverse proxy + SSL |
| Deploy | `deploy.sh` | Deployment commands |

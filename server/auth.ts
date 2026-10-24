// Email + password accounts, each with its own workspace. Sessions are opaque random tokens in an
// httpOnly cookie; only their SHA-256 hash is stored, so a leaked database can't be used to log in.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { SessionUser } from "../shared/types.js";
import { db } from "./db/client.js";
import { analyses, sessions, users, workspaces } from "./db/schema.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "aivista_session";
const SESSION_DAYS = 30;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split("$");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

async function startSession(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ token: sha256(token), userId, expiresAt: expires.toISOString() });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, expires, path: "/" });
}

async function loadUser(userId: string): Promise<SessionUser | undefined> {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, workspaceId: users.workspaceId, workspaceName: workspaces.name })
    .from(users)
    .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .where(eq(users.id, userId));
  return row && { ...row, authRequired: true };
}

/** Login is off unless REQUIRE_LOGIN=true: everyone then shares one default workspace. */
export const loginRequired = () => process.env.REQUIRE_LOGIN === "true";

const DEFAULT_WORKSPACE_ID = "default";
const DEFAULT_USER: SessionUser = {
  id: "default", email: "", name: "AIVista", workspaceId: DEFAULT_WORKSPACE_ID, workspaceName: "AIVista", authRequired: false,
};

/** Creates the shared workspace used when login is off; it adopts analyses that have no workspace yet. */
export async function ensureDefaultWorkspace(onCreated: (workspaceId: string) => Promise<void>) {
  const [existing] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, DEFAULT_WORKSPACE_ID));
  if (!existing) {
    await db.insert(workspaces).values({ id: DEFAULT_WORKSPACE_ID, name: "AIVista", createdAt: new Date().toISOString() });
  }
  await db.update(analyses).set({ workspaceId: DEFAULT_WORKSPACE_ID }).where(isNull(analyses.workspaceId));
  const [any] = await db.select({ id: analyses.id }).from(analyses).where(eq(analyses.workspaceId, DEFAULT_WORKSPACE_ID)).limit(1);
  if (!any) await onCreated(DEFAULT_WORKSPACE_ID);
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  if (!loginRequired()) {
    req.user = DEFAULT_USER;
    next();
    return;
  }
  const token = readCookie(req, COOKIE);
  if (token) {
    const [s] = await db.select().from(sessions)
      .where(and(eq(sessions.token, sha256(token)), gt(sessions.expiresAt, new Date().toISOString())));
    if (s) req.user = await loadUser(s.userId);
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in" });
    return;
  }
  next();
}

// Basic brute-force protection: 10 failed logins per IP per 15 minutes.
const failures = new Map<string, { count: number; until: number }>();
function tooManyAttempts(ip: string) {
  const f = failures.get(ip);
  return !!f && f.count >= 10 && f.until > Date.now();
}
function recordFailure(ip: string) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + 15 * 60_000 });
  else f.count++;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signup(req: Request, res: Response, onNewWorkspace: (workspaceId: string) => Promise<void>) {
  if (process.env.ALLOW_SIGNUP === "false") {
    res.status(403).json({ error: "Sign-ups are disabled on this server" });
    return;
  }
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const workspaceName = String(req.body?.workspaceName ?? "").trim() || `${name.split(" ")[0] || "My"}'s workspace`;
  if (!name || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter your name and a valid email" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }
  const now = new Date().toISOString();
  const workspaceId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const isFirstUser = !(await db.select({ id: users.id }).from(users).limit(1)).length;
  await db.insert(workspaces).values({ id: workspaceId, name: workspaceName, createdAt: now });
  await db.insert(users).values({ id: userId, email, name, passwordHash: await hashPassword(password), workspaceId, createdAt: now });
  // The first account adopts analyses created before accounts existed.
  if (isFirstUser) await db.update(analyses).set({ workspaceId }).where(isNull(analyses.workspaceId));
  await onNewWorkspace(workspaceId);
  await startSession(req, res, userId);
  res.status(201).json(await loadUser(userId));
}

export async function login(req: Request, res: Response) {
  const ip = req.ip ?? "unknown";
  if (tooManyAttempts(ip)) {
    res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    return;
  }
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailure(ip);
    res.status(401).json({ error: "Wrong email or password" });
    return;
  }
  failures.delete(ip);
  await startSession(req, res, user.id);
  res.json(await loadUser(user.id));
}

export async function logout(req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.token, sha256(token)));
  res.clearCookie(COOKIE, { path: "/" });
  res.status(204).end();
}

export async function pruneSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
}

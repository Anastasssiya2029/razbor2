import type { NextFunction, Request, Response } from "express";
import { findUserBySessionToken } from "../domain/auth/repository";
import { readSessionToken } from "../domain/auth/session";
import type { AuthenticatedAppUser, AppRole } from "../domain/auth/types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthenticatedAppUser;
    }
  }
}

export async function attachAuthUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readSessionToken(req.headers.cookie);
  if (token) {
    req.authUser = (await findUserBySessionToken(token)) ?? undefined;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Требуется вход." });
    return;
  }
  next();
}

export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: "Требуется вход." });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "Недостаточно прав." });
      return;
    }
    next();
  };
}

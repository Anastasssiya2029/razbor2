import { Router, type IRouter } from "express";
import {
  AcceptInviteBody,
  AcceptInviteParams,
  BootstrapFirstArchitectBody,
  ChangeUserRoleBody,
  ChangeUserRoleParams,
  CreateInviteBody,
  GetInvitePreviewParams,
  LoginBody,
} from "@workspace/api-zod";
import {
  acceptInviteAndSetPassword,
  bootstrapFirstArchitect,
  changeRole,
  createInvite,
  getInvitePreview,
  listUsers,
  loginWithPassword,
  logout,
  AppAuthError,
} from "../domain/auth/service";
import { readSessionToken, sessionCookie, clearSessionCookie } from "../domain/auth/session";
import { attachAuthUser, requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(attachAuthUser);

function handleAuthError(error: unknown, res: import("express").Response): void {
  if (error instanceof AppAuthError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  throw error;
}

router.post("/auth/bootstrap", async (req, res) => {
  try {
    const body = BootstrapFirstArchitectBody.parse(req.body);
    const user = await bootstrapFirstArchitect(body);
    res.status(201).json(user);
  } catch (error) {
    handleAuthError(error, res);
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const body = LoginBody.parse(req.body);
    const { user, token, expiresAt } = await loginWithPassword(body.email, body.password);
    void expiresAt;
    res.setHeader("Set-Cookie", sessionCookie(token, process.env.NODE_ENV === "production"));
    res.status(200).json(user);
  } catch (error) {
    handleAuthError(error, res);
  }
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  const token = readSessionToken(req.headers.cookie);
  if (token) await logout(token);
  res.setHeader("Set-Cookie", clearSessionCookie(process.env.NODE_ENV === "production"));
  res.status(204).end();
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.status(200).json(req.authUser);
});

router.get("/auth/users", requireAuth, requireRole("architect", "admin"), async (_req, res) => {
  res.status(200).json(await listUsers());
});

router.patch("/auth/users/:userId/role", requireAuth, requireRole("architect"), async (req, res) => {
  try {
    const params = ChangeUserRoleParams.parse(req.params);
    const body = ChangeUserRoleBody.parse(req.body);
    const user = await changeRole({ actorRole: req.authUser!.role, userId: params.userId, role: body.role });
    res.status(200).json(user);
  } catch (error) {
    handleAuthError(error, res);
  }
});

router.post("/auth/invites", requireAuth, requireRole("architect", "admin"), async (req, res) => {
  try {
    const body = CreateInviteBody.parse(req.body);
    const invite = await createInvite({ actorRole: req.authUser!.role, actorUserId: req.authUser!.id, ...body });
    res.status(201).json(invite);
  } catch (error) {
    handleAuthError(error, res);
  }
});

router.get("/auth/invites/:token", async (req, res) => {
  const params = GetInvitePreviewParams.parse(req.params);
  const preview = await getInvitePreview(params.token);
  if (!preview) {
    res.status(404).json({ error: "Приглашение не найдено." });
    return;
  }
  res.status(200).json(preview);
});

router.post("/auth/invites/:token/accept", async (req, res) => {
  try {
    const params = AcceptInviteParams.parse(req.params);
    const body = AcceptInviteBody.parse(req.body);
    const user = await acceptInviteAndSetPassword({ token: params.token, password: body.password });
    res.status(200).json(user);
  } catch (error) {
    handleAuthError(error, res);
  }
});

export default router;

import { Router, type IRouter } from "express";
import { CreateClientBody } from "@workspace/api-zod";
import { createClient, listClientsForOwner } from "../domain/diagnostic/repository";
import { canViewAllAnalyses } from "../domain/auth/policy";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/clients", requireAuth, async (req, res) => {
  const clients = await listClientsForOwner(req.authUser!.id, canViewAllAnalyses(req.authUser!.role));
  res.status(200).json(clients);
});

router.post("/clients", requireAuth, async (req, res) => {
  const body = CreateClientBody.parse(req.body);
  const client = await createClient({ ownerUserId: req.authUser!.id, displayName: body.displayName, contactInfo: body.contactInfo ?? null });
  res.status(201).json(client);
});

export default router;

import { Router, type IRouter } from "express";
import { ExportDiagnosticAnswersQueryParams } from "@workspace/api-zod";
import { getDiagnosticById, getClientById } from "../domain/diagnostic/repository";
import { canAccessOwnedAnalysis, canViewAllAnalyses } from "../domain/auth/policy";
import { buildRegistryWorkbook } from "../domain/export/registry-workbook";
import { buildAnswersWorkbook, type AnswersExportEntry } from "../domain/export/answers-workbook";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/**
 * Builds a Content-Disposition header value that carries a human-readable
 * (possibly Cyrillic) filename via the RFC 5987 filename* parameter, with a
 * plain ASCII fallback filename for older clients. HTTP header values must
 * be ISO-8859-1/ASCII, so a Cyrillic name can never go directly into
 * `filename="..."` -- doing so throws ERR_INVALID_CHAR at the http layer.
 */
function contentDisposition(base: string, extension: string): string {
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "export";
  const asciiFilename = `${safeBase}.${extension}`;
  const utf8Filename = `${base.slice(0, 100)}.${extension}`;
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`;
}

router.get("/diagnostics/registry.xlsx", requireAuth, async (req, res) => {
  const buffer = await buildRegistryWorkbook({
    ownerUserId: req.authUser!.id,
    canViewAll: canViewAllAnalyses(req.authUser!.role),
  });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", contentDisposition("registry", "xlsx"));
  res.status(200).send(buffer);
});

router.get("/diagnostics/answers.xlsx", requireAuth, async (req, res) => {
  const { ids } = ExportDiagnosticAnswersQueryParams.parse(req.query);
  const diagnosticIds = [...new Set(ids.split(",").map((id) => id.trim()).filter(Boolean))];
  if (diagnosticIds.length === 0) {
    res.status(400).json({ error: "Не выбраны диагностики для выгрузки." });
    return;
  }

  const diagnostics = await Promise.all(diagnosticIds.map((id) => getDiagnosticById(id)));
  const accessible = diagnostics.filter(
    (diagnostic): diagnostic is NonNullable<typeof diagnostic> =>
      diagnostic != null && canAccessOwnedAnalysis(req.authUser!.role, req.authUser!.id, diagnostic.ownerUserId),
  );
  if (accessible.length === 0) {
    res.status(404).json({ error: "Диагностики не найдены." });
    return;
  }

  const clients = await Promise.all(accessible.map((diagnostic) => getClientById(diagnostic.clientId)));
  const entries: AnswersExportEntry[] = accessible.map((diagnostic, index) => ({
    diagnostic,
    clientName: clients[index]?.displayName ?? "Неизвестный клиент",
  }));

  const buffer = await buildAnswersWorkbook(entries);
  const filename = entries.length === 1 ? entries[0]!.clientName : `Ответы_${entries.length}_клиентов`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", contentDisposition(filename, "xlsx"));
  res.status(200).send(buffer);
});

export default router;

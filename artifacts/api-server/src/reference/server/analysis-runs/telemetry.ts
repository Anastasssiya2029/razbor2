import { analysisRunsTable as analysisRuns, db } from "@workspace/db";
import { eq } from "drizzle-orm";

const MAX_PIPELINE_REQUEST_EVENTS = 30;

type PipelineRequestEvent = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  initialStatus: string;
  finalStatus: string | null;
  outcome: "running" | "completed" | "failed";
  errorCode: string | null;
  elapsedMs: number | null;
};

export type PipelineRequestTelemetryHandle = Pick<
  PipelineRequestEvent,
  "id" | "startedAt"
>;

function parseMetadata(value: Record<string, unknown> | null): Record<string, unknown> {
  return value ?? {};
}

function parseEvents(metadata: Record<string, unknown>): PipelineRequestEvent[] {
  const raw = metadata.pipelineRequests;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is PipelineRequestEvent =>
    Boolean(item)
    && typeof item === "object"
    && typeof (item as PipelineRequestEvent).id === "string"
    && typeof (item as PipelineRequestEvent).startedAt === "string",
  );
}

async function loadTelemetrySource(analysisRunId: string) {
  const rows = await db
    .select({
      status: analysisRuns.status,
      metadata: analysisRuns.metadata,
    })
    .from(analysisRuns)
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  return rows[0] ?? null;
}

export async function startAnalysisPipelineRequest(
  analysisRunId: string,
): Promise<PipelineRequestTelemetryHandle | null> {
  const source = await loadTelemetrySource(analysisRunId);
  if (!source) return null;
  const startedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const metadata = parseMetadata(source.metadata);
  const events = parseEvents(metadata);
  events.push({
    id,
    startedAt,
    finishedAt: null,
    initialStatus: source.status,
    finalStatus: null,
    outcome: "running",
    errorCode: null,
    elapsedMs: null,
  });
  await db
    .update(analysisRuns)
    .set({
      metadata: {
        ...metadata,
        pipelineRequests: events.slice(-MAX_PIPELINE_REQUEST_EVENTS),
      },
    })
    .where(eq(analysisRuns.id, analysisRunId));
  return { id, startedAt };
}

export async function finishAnalysisPipelineRequest(
  analysisRunId: string,
  handle: PipelineRequestTelemetryHandle,
  result: {
    outcome: "completed" | "failed";
    finalStatus: string | null;
    errorCode?: string | null;
  },
): Promise<void> {
  const source = await loadTelemetrySource(analysisRunId);
  if (!source) return;
  const finishedAt = new Date().toISOString();
  const elapsedMs = Math.max(
    0,
    new Date(finishedAt).getTime() - new Date(handle.startedAt).getTime(),
  );
  const metadata = parseMetadata(source.metadata);
  const events = parseEvents(metadata);
  const index = events.findIndex((event) => event.id === handle.id);
  const completed: PipelineRequestEvent = {
    id: handle.id,
    startedAt: handle.startedAt,
    finishedAt,
    initialStatus: index >= 0 ? events[index].initialStatus : source.status,
    finalStatus: result.finalStatus,
    outcome: result.outcome,
    errorCode: result.errorCode ?? null,
    elapsedMs,
  };
  if (index >= 0) events[index] = completed;
  else events.push(completed);
  await db
    .update(analysisRuns)
    .set({
      metadata: {
        ...metadata,
        pipelineRequests: events.slice(-MAX_PIPELINE_REQUEST_EVENTS),
      },
    })
    .where(eq(analysisRuns.id, analysisRunId));
}

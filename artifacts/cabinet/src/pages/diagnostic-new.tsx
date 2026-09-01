"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useCreateDiagnostic,
  useGetDiagnostic,
  getGetDiagnosticQueryKey,
  useAdvanceAnalysisRun,
  useRetryAnalysisRun,
  useGetAnalysisRun,
  getGetAnalysisRunQueryKey,
  useGetAnalysisResult,
  getGetAnalysisResultQueryKey,
  useGenerateSituationSummary,
  useGetAverageAnalysisRunDuration,
  getGetAverageAnalysisRunDurationQueryKey,
  type AnalysisRun,
  type AnalysisRunStatus,
  type SituationSummary,
} from "@workspace/api-client-react";
import { HeaderMenu } from "@/components/cabinet-header";
import { AppBrand } from "@/components/brand";
import { useToast } from "@/hooks/use-toast";
import {
  NeuroAnalysisScreen,
  AnalysisSection,
  type AnalysisProgressStatus,
} from "@/components/analysis-visualization";
import { resolveGrowthPriorityPlan } from "@/lib/growth-priority-plan";
import { DiagnosticAnswersView } from "@/components/diagnostic-answers-view";
import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import type { AnalysisResultV1 } from "@/lib/server/analysis-result-types";
import {
  DEFAULT_CLIENT_PATH,
  emptyDiagnosticValues,
  formatMoneyInput,
  formatRubles,
  valuesForSubmission,
} from "@/lib/diagnostic-form";
import {
  DiagnosticContractError,
  normalizeDiagnosticSubmission,
  validateDiagnosticInput,
  type ClientsCountPeriod,
} from "@/lib/diagnostic-input";
import { validateFlatDiagnosticNumericFields } from "@/lib/diagnostic-numeric-fields";
import { hasQaPrefillHash, readQaPrefillHash } from "@/lib/qa-prefill";
import { markLiveDiagnosticSession } from "@/lib/live-diagnostic-session";

// Only these failures can resume the same run (server-side rules in
// reference/server/analysis-runs/pipeline.ts: retryFailedAnalysisPipeline).
// Any other errorCode (e.g. the P-01 evidence-quality gate) is terminal --
// the client must submit a new, more detailed diagnostic instead.
function isRecoverableFailure(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  if (errorCode === "P02_NO_ACTIONABLE_TARGET_GAP") return false;
  return errorCode.startsWith("P02_") || errorCode.startsWith("P04_");
}

type FieldProps = {
  label: string;
  name: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  variant?: "text" | "number" | "money";
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

const DRAFT_KEY = "tbs_diagnostic_draft";

const tabs = [
  { id: 0, label: "Сейчас и цель" },
  { id: 1, label: "Инфо о проекте" },
  { id: 2, label: "Опыт" },
];

const stages = [
  { label: "Диагностика", accessibleLabel: "Диагностика" },
  { label: "Разбор", accessibleLabel: "Разбор" },
  { label: "План перехода", accessibleLabel: "План перехода" },
  { label: "", accessibleLabel: "Бонусный этап" },
];

// Splits a paragraph on **bold** markers (the API wraps money amounts and
// the obstacles heading in them) and renders the matched groups as <strong>,
// since the summary is otherwise plain, unmarked-up text.
function renderBoldParagraph(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>));
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="arrow-icon">
      <path d="M5 12h14M14 6l6 6-6 6" />
    </svg>
  );
}

function Field({
  label,
  name,
  multiline = false,
  rows = 2,
  className = "",
  variant = "text",
  values,
  setValues,
}: FieldProps) {
  const id = `field-${name}`;
  const value = values[name] ?? "";
  const displayValue = variant === "money" ? formatMoneyInput(value) : value;
  const updateValue = (nextValue: string) => {
    setValues((current) => ({
      ...current,
      [name]: variant === "money" ? formatMoneyInput(nextValue) : nextValue,
    }));
  };
  const shared = {
    id,
    name,
    value: displayValue,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      updateValue(event.target.value),
  };

  return (
    <label className={`field field-${variant} ${multiline ? "multiline-field" : ""} ${className}`} htmlFor={id}>
      <span>{label}</span>
      {variant === "money" ? (
        <span className="money-input-wrap">
          <input {...shared} className="money-input-control" inputMode="numeric" autoComplete="off" placeholder="0" />
          <span aria-hidden="true">₽</span>
        </span>
      ) : (
        <textarea {...shared} inputMode={variant === "number" ? "numeric" : undefined} rows={multiline ? rows : 1} />
      )}
    </label>
  );
}

type Draft = {
  values: Record<string, string>;
  deadline: string;
  clientsCountPeriod: ClientsCountPeriod;
  desiredSystemHoursApplicable: boolean;
  activeTab: number;
};

export default function DiagnosticNewPage() {
  const [, setLocation] = useLocation();
  // When mounted at /analysis/:diagnosticId (see App.tsx), restore the
  // in-progress waiting/reveal flow from the server instead of showing a
  // blank form -- a refresh, closed tab, or shared link must be able to
  // resume the same client-facing analysis flow, not just a fresh submit.
  const routeParams = useParams<{ diagnosticId?: string }>();
  const routeDiagnosticId = routeParams.diagnosticId;
  const { toast } = useToast();
  const createDiagnostic = useCreateDiagnostic();
  const [activeTab, setActiveTab] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...emptyDiagnosticValues(),
    clientPath: DEFAULT_CLIENT_PATH,
  }));
  const [deadline, setDeadline] = useState("6 месяцев");
  const [clientsCountPeriod, setClientsCountPeriod] = useState<ClientsCountPeriod>("month");
  const [desiredSystemHoursApplicable, setDesiredSystemHoursApplicable] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [situationSummary, setSituationSummary] = useState<SituationSummary | null>(null);
  const [situationSummaryError, setSituationSummaryError] = useState(false);
  const situationSummaryAnswersRef = useRef<string | null>(null);
  const [situationSummaryRetryNonce, setSituationSummaryRetryNonce] = useState(0);
  const generateSituationSummary = useGenerateSituationSummary();
  // Stable id for this form session, generated once per mount. Sent with
  // every situation-summary call (before any diagnostic exists) and again
  // on final submit, so the server can attribute that pre-submission AI
  // spend to the resulting analysis run's cost total instead of losing it.
  const situationSessionIdRef = useRef<string>(crypto.randomUUID());

  // Once the diagnostic is submitted we stay on this page and drive the
  // client-facing "Alex is analyzing" flow ourselves, instead of navigating
  // to the manager-only status stepper (that page is left untouched for
  // manager revisits). We keep advancing the pipeline one step per tick,
  // the same way the manager cabinet does, and reveal the 7K model as soon
  // as `overview` appears on the run -- well before the full plan is ready.
  const [diagnosticId, setDiagnosticId] = useState<string | null>(null);
  // The saved answers, in canonical nested shape, used to render the exact
  // same intake-form UI (via DiagnosticAnswersView) when the manager clicks
  // back to step 1 while still on this live /analysis/:id page -- instead
  // of navigating away to the separate manager-cabinet "saved" pages, which
  // look and behave differently from what the client saw during the run.
  const [diagnosticInput, setDiagnosticInput] = useState<DiagnosticInputV1_2 | null>(null);
  // Which stage of THIS page is showing: 0 = the submitted answers (step 1),
  // 1 = the live business-model/analysis carousel (step 2). Switching this
  // never navigates or remounts the page, so polling/advance state for the
  // run survives going back and forth.
  const [viewStep, setViewStep] = useState<0 | 1>(1);
  // analysisRunId is captured the moment the diagnostic is created, and is
  // the source of truth for which run to poll/advance -- independent of
  // `run` (the last known run payload). If the very first advance call
  // rejects (e.g. an immediate P-01 evidence-quality failure), `run` would
  // otherwise stay null forever and both the GET poll and the advance loop
  // below key off `run?.id`, permanently stalling the waiting screen with no
  // way to observe the failure. Keying both effects off `analysisRunId`
  // instead means they start as soon as the run exists server-side,
  // regardless of whether any advance call has succeeded yet.
  const [analysisRunId, setAnalysisRunId] = useState<string | null>(null);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const autoAdvance = useAdvanceAnalysisRun();
  const retryFailedRun = useRetryAnalysisRun();
  // Fetched once and reused for the whole waiting screen -- the typical
  // duration barely moves run to run, so there is no need to keep polling it
  // while the client is waiting.
  const { data: averageDuration } = useGetAverageAnalysisRunDuration({
    query: { queryKey: getGetAverageAnalysisRunDurationQueryKey(), staleTime: Infinity, refetchOnWindowFocus: false },
  });
  const ADVANCE_RETRY_MS = 1200;
  const TERMINAL_STATUSES: AnalysisRunStatus[] = ["ready", "analysis_failed"];
  const isTerminal = !!run && TERMINAL_STATUSES.includes(run.status);

  // Restore state from the URL when this page is reached directly (reload,
  // shared link, browser back) rather than via a fresh submit in this same
  // session. GetDiagnostic already includes analysisRunId, so one request
  // is enough to know which run to resume polling/advancing.
  const { data: resumedDiagnostic } = useGetDiagnostic(routeDiagnosticId || "", {
    query: { enabled: !!routeDiagnosticId, queryKey: getGetDiagnosticQueryKey(routeDiagnosticId || "") },
  });
  useEffect(() => {
    if (!routeDiagnosticId || !resumedDiagnostic || diagnosticId) return;
    setDiagnosticId(resumedDiagnostic.diagnosticId);
    setAnalysisRunId(resumedDiagnostic.analysisRunId);
    setAnalysisStartedAt(new Date(resumedDiagnostic.createdAt).getTime());
    setDiagnosticInput((resumedDiagnostic.input as DiagnosticInputV1_2 | undefined) ?? null);
  }, [routeDiagnosticId, resumedDiagnostic, diagnosticId]);

  // The advance mutation's own response is not a reliable source of truth for
  // the run's *current* persisted status: when a pipeline stage fails, the
  // POST /run call itself rejects with an error (no run body), so relying
  // only on `onSuccess` to update `run` leaves the UI stuck showing the
  // waiting screen forever even though the run actually flipped to
  // analysis_failed server-side. Poll the run via GET (like diagnostic-view.tsx)
  // so `run` always reflects reality regardless of whether the last advance
  // call succeeded or failed.
  const { data: liveRun } = useGetAnalysisRun(analysisRunId || "", {
    query: {
      enabled: !!analysisRunId && !isTerminal,
      queryKey: getGetAnalysisRunQueryKey(analysisRunId || ""),
      refetchInterval: (query) => {
        const state = query.state.data;
        return state && TERMINAL_STATUSES.includes(state.status) ? false : 2000;
      },
    },
  });

  useEffect(() => {
    if (liveRun) setRun(liveRun);
  }, [liveRun]);

  // Being on this page with a known diagnosticId -- whether we just submitted
  // the form or resumed via /analysis/:diagnosticId -- IS the live session.
  // Record it so Plan/Gift's "Разбор" link keeps returning here instead of
  // the saved result until the manager explicitly leaves to "Мои разборы".
  useEffect(() => {
    if (diagnosticId) markLiveDiagnosticSession(diagnosticId);
  }, [diagnosticId]);

  // The "key bundle" preview on the second business-model slide only has
  // real content once the run is fully ready -- growthPoint text is written
  // by the very last pipeline stage (P-04), so there is no earlier, partial
  // version of it worth fetching. Until then AnalysisSection just renders a
  // "forming" skeleton from `growthBundle == null`.
  const { data: readyResult } = useGetAnalysisResult(analysisRunId || "", {
    query: {
      enabled: !!analysisRunId && run?.status === "ready",
      queryKey: getGetAnalysisResultQueryKey(analysisRunId || ""),
    },
  });
  const growthBundle = useMemo(() => {
    if (!readyResult) return null;
    const result = readyResult.result as AnalysisResultV1;
    const priorityPlan = resolveGrowthPriorityPlan(result);
    const paused = result.report.whyNotNow
      .filter((item) => result.target.targetScores[item.element_id] === result.current.scores[item.element_id])
      .map((item) => ({ elementId: item.element_id, text: item.text, returnTrigger: item.return_trigger ?? null }));
    return {
      core: priorityPlan.core,
      supporting: priorityPlan.supporting,
      currentScores: result.current.scores,
      targetScores: result.target.targetScores,
      title: result.report.growthPoint.title,
      explanation: result.report.growthPoint.coach_explanation,
      paused,
    };
  }, [readyResult]);

  const runStatusRef = useRef<AnalysisRunStatus | undefined>(run?.status);
  runStatusRef.current = run?.status;
  const isAdvancingRef = useRef(false);

  useEffect(() => {
    if (!analysisRunId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      const status = runStatusRef.current;
      if (status && TERMINAL_STATUSES.includes(status)) return;
      if (isAdvancingRef.current) {
        timeoutId = setTimeout(tick, ADVANCE_RETRY_MS);
        return;
      }
      isAdvancingRef.current = true;
      autoAdvance.mutate(
        { analysisRunId },
        {
          onSuccess: (updated) => {
            setRun(updated);
            setBackgroundError(null);
          },
          onError: (error: any) => {
            setBackgroundError(error?.message || "Не удалось продолжить сборку плана");
          },
          onSettled: () => {
            isAdvancingRef.current = false;
            // The GET poll above is what learns the true terminal status
            // (including analysis_failed from a rejected advance call); it
            // will stop `enabled` once `run` is terminal. Keep ticking here
            // until then so we don't rely solely on the mutation's own
            // (possibly always-erroring) response to know when to stop.
            if (!cancelled && !(runStatusRef.current && TERMINAL_STATUSES.includes(runStatusRef.current))) {
              timeoutId = setTimeout(tick, ADVANCE_RETRY_MS);
            }
          },
        },
      );
    };

    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [analysisRunId, run?.status]);

  const handleRetryPlan = async () => {
    if (!run) return;
    try {
      const updated = await retryFailedRun.mutateAsync({ analysisRunId: run.id });
      setRun(updated);
      setBackgroundError(null);
    } catch (error: any) {
      setBackgroundError(error?.message || "Не удалось возобновить сборку плана");
    }
  };

  // The AI-generated situation summary depends only on the free-text/number
  // answer fields (not UI-only state like activeTab), so we key regeneration
  // off a stable snapshot of those and skip re-calling the model when the
  // client revisits this tab without changing anything.
  const situationAnswers = useMemo(() => ({ ...values, deadline }), [values, deadline]);
  const situationAnswersKey = useMemo(() => JSON.stringify(situationAnswers), [situationAnswers]);

  useEffect(() => {
    if (activeTab !== 2) return;
    if (situationAnswersKey === situationSummaryAnswersRef.current) return;
    situationSummaryAnswersRef.current = situationAnswersKey;
    setSituationSummaryError(false);
    generateSituationSummary.mutate(
      { data: { answers: situationAnswers, sessionId: situationSessionIdRef.current } },
      {
        onSuccess: (summary) => setSituationSummary(summary),
        onError: () => {
          setSituationSummary(null);
          setSituationSummaryError(true);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, situationAnswersKey, situationSummaryRetryNonce]);

  const retrySituationSummary = () => {
    situationSummaryAnswersRef.current = null;
    setSituationSummaryRetryNonce((n) => n + 1);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<Draft>;
        if (draft.values && typeof draft.values === "object") {
          setValues({ ...emptyDiagnosticValues(), ...draft.values });
          if (typeof draft.deadline === "string") setDeadline(draft.deadline);
          if (draft.clientsCountPeriod === "month" || draft.clientsCountPeriod === "launch") setClientsCountPeriod(draft.clientsCountPeriod);
          if (typeof draft.desiredSystemHoursApplicable === "boolean") setDesiredSystemHoursApplicable(draft.desiredSystemHoursApplicable);
          if (Number.isInteger(draft.activeTab) && Number(draft.activeTab) >= 0 && Number(draft.activeTab) <= 2) setActiveTab(Number(draft.activeTab));
        }
      }
      if (hasQaPrefillHash(window.location.hash)) {
        const prefill = readQaPrefillHash(window.location.hash);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        if (prefill) {
          setValues({ ...emptyDiagnosticValues(), ...prefill.values });
          setDeadline(prefill.deadline);
          setClientsCountPeriod(prefill.clientsCountPeriod);
          setDesiredSystemHoursApplicable(prefill.desiredSystemHoursApplicable);
          setActiveTab(2);
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    } finally {
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, deadline, clientsCountPeriod, desiredSystemHoursApplicable, activeTab }));
  }, [activeTab, clientsCountPeriod, deadline, desiredSystemHoursApplicable, loaded, values]);

  const goToTab = (tab: number) => {
    setSubmissionError(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  const validateNumbers = () => {
    const issue = validateFlatDiagnosticNumericFields(values, { desiredSystemHoursApplicable })[0];
    if (issue) {
      setActiveTab(0);
      setSubmissionError(issue.message);
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validateNumbers()) return;
    setSubmissionError(null);
    const payload = {
      intent: "submit",
      sessionId: situationSessionIdRef.current,
      sourceSchemaVersion: "diagnostic-flat-form.v1.2",
      rawAnswers: {
        values: valuesForSubmission(values),
        deadline,
        clientsCountPeriod,
        desiredSystemWeeklyHoursApplicable: desiredSystemHoursApplicable,
      },
    };
    let diagnostic: Awaited<ReturnType<typeof createDiagnostic.mutateAsync>>;
    try {
      // Validate the same flat source-key payload locally before the server normalizes it.
      validateDiagnosticInput(normalizeDiagnosticSubmission(payload).input);
      diagnostic = await createDiagnostic.mutateAsync({ data: payload });
    } catch (error) {
      const message = error instanceof DiagnosticContractError
        ? error.issues[0]?.message
        : error instanceof Error ? error.message : "Не удалось сохранить анкету";
      setSubmissionError(message ?? "Не удалось сохранить анкету");
      toast({ title: "Ошибка сохранения", description: message ?? "Не удалось сохранить анкету", variant: "destructive" });
      return;
    }

    // The diagnostic itself is saved at this point -- commit to the waiting
    // screen and record analysisRunId immediately, independent of whether
    // the kickoff `/run` call below succeeds. If that first advance call
    // rejects (e.g. an immediate P-01 evidence-quality failure), the GET
    // poll and the tick effect above -- both keyed on analysisRunId, not on
    // `run` -- pick up the true persisted (failed) status on their own, so
    // the waiting screen never hangs with no way out.
    localStorage.removeItem(DRAFT_KEY);
    toast({ title: "Анкета сохранена", description: "Начинаю разбор…" });
    setDiagnosticId(diagnostic.diagnosticId);
    setAnalysisStartedAt(Date.now());
    setAnalysisRunId(diagnostic.analysisRunId);
    setDiagnosticInput((diagnostic.input as DiagnosticInputV1_2 | undefined) ?? null);
    setViewStep(1);
    // Update the address bar to the resumable /analysis/:id URL without
    // triggering a wouter route change (which would unmount/remount this
    // page and discard the state we just set above) -- a plain history
    // update is enough so a later reload lands on the route that restores
    // the flow from the server instead of a blank form.
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.history.replaceState(null, "", `${base}/analysis/${diagnostic.diagnosticId}`);
    try {
      const startedRun = await autoAdvance.mutateAsync({ analysisRunId: diagnostic.analysisRunId });
      setRun(startedRun);
    } catch (error: any) {
      setBackgroundError(error?.message || "Не удалось начать сборку разбора");
    }
  };

  if (!loaded) return <main className="admin-loading">Загружаю анкету…</main>;

  if (diagnosticId) {
    const status = run?.status;
    const isFailedBeforeOverview = status === "analysis_failed" && !run?.overview;
    const progressStatus: AnalysisProgressStatus =
      status && status !== "analysis_failed" && status !== "draft"
        ? status === "money_now_prescribing"
          ? "money_now"
          : status
        : "queued";

    return (
      <main className="site-shell diagnostic-new-shell">
        <header className="site-header">
          <AppBrand />
          <HeaderMenu onNewDiagnostic={() => window.location.assign(import.meta.env.BASE_URL)} />
        </header>
        <section className="hero" aria-labelledby="page-title">
          <span className="hero-badge">Авторский разбор для экспертов</span>
          <h1 id="page-title">Твоя Бизнес-Система</h1>
        </section>

        {viewStep === 0 ? (
          <DiagnosticAnswersView input={diagnosticInput} />
        ) : isFailedBeforeOverview ? (
          <section className="diagnostic-card" aria-label="Ошибка анализа">
            <p className="diagnostic-submit-error" role="alert">
              {run?.errorMessage || "Не удалось построить разбор. Попробуйте возобновить сборку."}
            </p>
            {isRecoverableFailure(run?.errorCode) ? (
              <button type="button" className="primary-button compact" onClick={() => void handleRetryPlan()} disabled={retryFailedRun.isPending}>
                {retryFailedRun.isPending ? "Возобновляю…" : "Повторить попытку"}
              </button>
            ) : (
              <p>
                Эта ошибка не устраняется повтором — заполните анкету ещё раз с более подробными ответами.{" "}
                <button type="button" className="secondary-button" onClick={() => window.location.assign(import.meta.env.BASE_URL)}>
                  Заполнить заново
                </button>
              </p>
            )}
          </section>
        ) : run?.overview ? (
          <AnalysisSection
            overview={run.overview}
            growthBundle={growthBundle}
            planReady={status === "ready"}
            progressStatus={progressStatus}
            // Derived from the persisted run status/error fields (falling
            // back to a transient in-session mutation error), so reopening
            // /analysis/:id after a reload shows the real failure/retry
            // state instead of a stale "plan still building" placeholder.
            failureMessage={
              status === "analysis_failed"
                ? backgroundError || run?.errorMessage || "Не удалось продолжить сборку плана"
                : null
            }
            failureRecoverable={status === "analysis_failed" ? isRecoverableFailure(run?.errorCode) : false}
            retrying={retryFailedRun.isPending}
            onRetryPlan={() => void handleRetryPlan()}
            onOpenPlan={() => setLocation(`/diagnostics/${diagnosticId}/plan`)}
            onStartOver={() => window.location.assign(import.meta.env.BASE_URL)}
          />
        ) : (
          <NeuroAnalysisScreen
            analysisStatus={progressStatus}
            startedAt={analysisStartedAt}
            averageDurationMs={averageDuration?.averageDurationMs ?? null}
          />
        )}

        <nav className="journey" aria-label="Этапы работы">
          {stages.map((stage, index) => (
            <button
              type="button"
              aria-label={stage.accessibleLabel}
              className={`journey-stage ${index === viewStep ? "active" : ""}`}
              aria-current={index === viewStep ? "step" : undefined}
              disabled={index === 1 ? !run?.overview : index > 1 && status !== "ready"}
              key={stage.accessibleLabel}
              onClick={() => {
                // Steps 1/2 stay on this same live page -- they just swap
                // which content is shown -- so the manager can freely go
                // back and forth without losing run polling state or ever
                // landing on the separate manager-cabinet "saved" pages.
                if (index === 0) setViewStep(0);
                if (index === 1 && run?.overview) setViewStep(1);
                if (index === 2 && status === "ready") setLocation(`/diagnostics/${diagnosticId}/plan`);
                if (index === 3 && status === "ready") setLocation(`/diagnostics/${diagnosticId}/gift`);
              }}
            >
              <span className="journey-number">{index + 1}</span>
              {stage.label && <span>{stage.label}</span>}
            </button>
          ))}
        </nav>
      </main>
    );
  }

  return (
    <main className="site-shell diagnostic-new-shell">
      <header className="site-header">
        <AppBrand />
        <HeaderMenu onNewDiagnostic={() => window.location.assign(import.meta.env.BASE_URL)} />
      </header>
      <section className="hero" aria-labelledby="page-title">
        <span className="hero-badge">Авторский разбор для экспертов</span>
        <h1 id="page-title">Твоя Бизнес-Система</h1>
        <p>
          Оцифруйте свой проект и постройте аутентичную систему, которая
          <br className="desktop-break" /> дает ресурсы, а не забирает их.
        </p>
      </section>
      <section className="diagnostic-card" aria-label="Диагностика бизнес-системы">
        <div className="identity-grid">
          <label className="identity-field">
            <span className="sr-only">Имя эксперта</span>
            <textarea rows={1} value={values.expertName ?? ""} onChange={(event) => setValues((current) => ({ ...current, expertName: event.target.value }))} placeholder="ИМЯ ЭКСПЕРТА" />
          </label>
          <label className="identity-field">
            <span className="sr-only">Ниша</span>
            <textarea rows={1} value={values.niche ?? ""} onChange={(event) => setValues((current) => ({ ...current, niche: event.target.value }))} placeholder="НИША" />
          </label>
        </div>

        <div className="tabs" role="tablist" aria-label="Этапы первого шага">
          {tabs.map((tab) => (
            <button type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} id={`tab-${tab.id}`} className={`tab ${activeTab === tab.id ? "active" : ""}`} key={tab.id} onClick={() => goToTab(tab.id)}>
              <span className="tab-number">{tab.id + 1}</span><span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="tab-content">
          {activeTab === 0 && <div id="panel-0" role="tabpanel" aria-labelledby="tab-0" className="panel panel-now">
            <section className="form-section current-section">
              <h2>1. СЕЙЧАС</h2>
              <div className="current-grid">
                <div className="current-fields">
                  <Field label="Доход в месяц" name="currentIncome" variant="money" values={values} setValues={setValues} />
                  <Field label="Количество клиентов" name="clientsCount" variant="number" values={values} setValues={setValues} />
                  <fieldset className="choice-fieldset clients-period-fieldset">
                    <legend>Количество указано</legend>
                    <div className="clients-period-options">
                      {[{ value: "month" as const, label: "За месяц" }, { value: "launch" as const, label: "За запуск" }].map((option) => (
                        <button type="button" key={option.value} className={clientsCountPeriod === option.value ? "selected" : ""} aria-pressed={clientsCountPeriod === option.value} onClick={() => setClientsCountPeriod(option.value)}>{option.label}</button>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="Время на проект в неделю" name="weeklyTime" variant="number" values={values} setValues={setValues} />
                </div>
                <div className="products-box">
                  <h3>Продукты</h3>
                  <Field label="Какие продукты продаёте" name="products" values={values} setValues={setValues} />
                  <Field label="Что чаще покупают" name="bestSeller" values={values} setValues={setValues} />
                  <Field label="Есть ли бесплатные продукты" name="freeProducts" values={values} setValues={setValues} />
                </div>
              </div>
            </section>
            <section className="form-section goal-section">
              <h2>2. ЦЕЛЬ</h2>
              <div className="goal-top-grid">
                <Field label="Доход в месяц" name="goalIncome" variant="money" values={values} setValues={setValues} />
                <Field label="На чём хотите зарабатывать (модель)" name="goalModel" values={values} setValues={setValues} />
              </div>
              <fieldset className="choice-fieldset deadline-fieldset"><legend>Срок</legend><div className="deadline-options">
                {["6 месяцев", "1 год", "2 года", "3 года"].map((option) => <button type="button" key={option} className={deadline === option ? "selected" : ""} aria-pressed={deadline === option} onClick={() => setDeadline(option)}>{option}</button>)}
              </div></fieldset>
              <div className="goal-bottom-grid">
                <Field label="Что хотите делегировать" name="delegate" values={values} setValues={setValues} />
                <div className="conditional-time-field">
                  <label className="time-goal-toggle"><input type="checkbox" checked={desiredSystemHoursApplicable} onChange={(event) => setDesiredSystemHoursApplicable(event.target.checked)} /><span><strong>Свобода времени входит в цель</strong><small>Отметьте, если хотите сократить личное участие или выйти из операционки.</small></span></label>
                  {desiredSystemHoursApplicable && <Field label="Время на проект (система есть)" name="systemTime" variant="number" values={values} setValues={setValues} />}
                </div>
              </div>
            </section>
            <button type="button" className="primary-button" onClick={() => { if (validateNumbers()) goToTab(1); }}>Заполнить инфо о проекте <ArrowIcon /></button>
            {submissionError && <p className="diagnostic-submit-error" role="alert">{submissionError}</p>}
          </div>}

          {activeTab === 1 && <div id="panel-1" role="tabpanel" aria-labelledby="tab-1" className="panel project-panel">
            <section className="form-section project-section"><h2>2. ИНФО О ПРОЕКТЕ</h2><div className="project-grid">
              <div className="project-column">
                <Field label="Кто клиенты" name="clients" multiline rows={2} values={values} setValues={setValues} />
                <Field label="Результат" name="result" multiline rows={2} values={values} setValues={setValues} />
                <Field label="Откуда приходят" name="sources" values={values} setValues={setValues} />
                <Field className="client-path-field" label="Путь клиента" name="clientPath" multiline rows={3} values={values} setValues={setValues} />
                <Field label="Продажи" name="sales" values={values} setValues={setValues} />
              </div>
              <div className="project-column project-assets-column">
                <Field label="Социальные активы" name="socialAssets" multiline rows={3} values={values} setValues={setValues} />
                <Field label="Команда" name="team" multiline rows={3} values={values} setValues={setValues} />
                <Field label="Уникальность" name="uniqueness" multiline rows={3} values={values} setValues={setValues} />
              </div>
            </div></section>
            <button type="button" className="primary-button" onClick={() => goToTab(2)}>Заполнить опыт <ArrowIcon /></button>
          </div>}

          {activeTab === 2 && <div id="panel-2" role="tabpanel" aria-labelledby="tab-2" className="panel experience-panel">
            <section className="form-section experience-section"><h2>3. ОПЫТ</h2><div className="experience-grid">
              <Field className="experience-main-field" label="Трудности" name="struggles" multiline rows={1} values={values} setValues={setValues} />
              <div className="experience-history-column">
                <Field label="Лучший период" name="bestPeriod" multiline rows={5} values={values} setValues={setValues} />
                <Field label="Ошибки и провалы" name="failures" multiline rows={5} values={values} setValues={setValues} />
              </div>
            </div></section>
            <section className="formula-section" aria-live="polite">
              <h3>Ваша ситуация</h3>
              <div className="formula-card">
                <span className="quote-mark">“</span>
                {generateSituationSummary.isPending && <p className="formula-status">Собираю связную историю из ваших ответов…</p>}
                {!generateSituationSummary.isPending && situationSummaryError && (
                  <div className="formula-status formula-status-error">
                    <p>Не получилось собрать выжимку. Попробуйте ещё раз.</p>
                    <button type="button" className="secondary-button" onClick={retrySituationSummary}>Повторить</button>
                  </div>
                )}
                {!generateSituationSummary.isPending && !situationSummaryError && situationSummary && (
                  <div className="formula-paragraphs">
                    {situationSummary.text.split("\n\n").map((paragraph, index) => (
                      <p key={index} style={{ whiteSpace: "pre-line" }}>{renderBoldParagraph(paragraph)}</p>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <div className="experience-actions">
              <button type="button" className="secondary-button" onClick={() => goToTab(0)}>Исправить</button>
              <button type="button" className="primary-button compact" onClick={() => void submit()} disabled={createDiagnostic.isPending}>{createDiagnostic.isPending ? "Сохраняю ответы…" : "Да, всё верно"} {!createDiagnostic.isPending && <ArrowIcon />}</button>
            </div>
            {submissionError && <p className="diagnostic-submit-error" role="alert">{submissionError}</p>}
          </div>}
        </div>
      </section>

      <nav className="journey" aria-label="Этапы работы">
        {stages.map((stage, index) => <button type="button" aria-label={stage.accessibleLabel} className={`journey-stage ${index === 0 ? "active" : ""}`} aria-current={index === 0 ? "step" : undefined} disabled={index !== 0} key={stage.accessibleLabel}><span className="journey-number">{index + 1}</span>{stage.label && <span>{stage.label}</span>}</button>)}
      </nav>
    </main>
  );
}
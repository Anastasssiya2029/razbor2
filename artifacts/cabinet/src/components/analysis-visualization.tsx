// Client-facing "Alex is analyzing" waiting screen + progressive result
// visualization (archetype card, current/target 7K model, evolution map).
// Ported from the reference's app/page.tsx (NeuroAnalysisScreen,
// ArchetypeMedallion/Dialog, SystemModel, EvolutionMap, AnalysisSection).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  archetypeDefinitions,
  resolveSystemElements,
  systemScoreTone,
  type ArchetypeId,
  type ResolvedSystemElement,
  type SystemScore,
} from '@/lib/business-analysis';
import { buildCurrentSystemSummary } from '@/lib/current-system-summary';
import { SEVEN_K_ELEMENTS } from '@/lib/server/7k/config/elements.v1';
import { SEVEN_K_BUSINESS_LEVERS } from '@/lib/7k-business-levers';
import type { SevenKElementId, SevenKScores } from '@/lib/server/7k/types';
import type { AnalysisOverview, AnalysisRunStatus } from '@workspace/api-client-react';

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="arrow-icon">
      <path d="M5 12h14M14 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="chevron-icon">
      <path d={direction === 'left' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
    </svg>
  );
}

export function BrainIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M11.2 6.1c-.2-1.8-1.6-3.1-3.3-3.1-1.8 0-3.3 1.5-3.3 3.4v.2A3.5 3.5 0 0 0 3 9.5c0 1.2.6 2.3 1.5 2.9a3.5 3.5 0 0 0-.5 1.8c0 1.9 1.5 3.4 3.4 3.5.5 1.7 2.2 2.8 3.8 2.1V6.1Z" />
      <path d="M12.8 6.1c.2-1.8 1.6-3.1 3.3-3.1 1.8 0 3.3 1.5 3.3 3.4v.2A3.5 3.5 0 0 1 21 9.5c0 1.2-.6 2.3-1.5 2.9.3.5.5 1.1.5 1.8 0 1.9-1.5 3.4-3.4 3.5-.5 1.7-2.2 2.8-3.8 2.1V6.1Z" />
      <path d="M7.8 6.4c1.3 0 2.2 1 2.2 2.2M6.4 11.3c1.5-.3 2.8.7 2.9 2.2M8 17.5c-.1-1.2.7-2.2 1.8-2.5M16.2 6.4c-1.3 0-2.2 1-2.2 2.2M17.6 11.3c-1.5-.3-2.8.7-2.9 2.2M16 17.5c.1-1.2-.7-2.2-1.8-2.5" />
    </svg>
  );
}

function ArchetypeGlyph({ kind }: { kind: ArchetypeId }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="archetype-glyph">
      {kind === 'altruist' && (
        <path {...common} d="M12 20.3S4.8 16 4.8 10.1A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.2 2.7c0 5.9-7.2 10.2-7.2 10.2Z" />
      )}
      {kind === 'explorer' && (
        <>
          <circle {...common} cx="12" cy="12" r="8.5" />
          <path {...common} d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </>
      )}
      {kind === 'creator' && (
        <>
          <path {...common} d="m4.4 19.6 3.7-.9L19 7.8 16.2 5 5.3 15.9l-.9 3.7Z" />
          <path {...common} d="m14.7 6.5 2.8 2.8M4.4 19.6l2.7-2.7" />
        </>
      )}
      {kind === 'hero' && <path {...common} d="M13.3 2.7 5.7 13h5.7l-.7 8.3L18.3 11h-5.7l.7-8.3Z" />}
      {kind === 'magician' && (
        <>
          <path {...common} d="M12 3.2 13.4 8l4.8 1.4-4.8 1.4L12 15.6l-1.4-4.8-4.8-1.4L10.6 8 12 3.2Z" />
          <path {...common} d="m18.3 15.2.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
        </>
      )}
      {kind === 'ruler' && (
        <>
          <path {...common} d="m4.2 8.2 4 3.1L12 5l3.8 6.3 4-3.1-1.4 9.2H5.6L4.2 8.2Z" />
          <path {...common} d="M6 20h12" />
        </>
      )}
    </svg>
  );
}

export function ArchetypeMedallion({ kind, className = '' }: { kind: ArchetypeId; className?: string }) {
  return (
    <span className={`archetype-medallion ${className}`} aria-hidden="true">
      <span className="medallion-orbit" />
      <ArchetypeGlyph kind={kind} />
    </span>
  );
}

const archetypePortraits: Record<ArchetypeId, { src: string; position: string }> = {
  altruist: { src: '/archetype-altruist.jpg', position: '50% 28%' },
  explorer: { src: '/archetype-explorer.jpg', position: '50% 31%' },
  creator: { src: '/archetype-creator.jpg', position: '50% 50%' },
  hero: { src: '/archetype-hero.png', position: '50% 24%' },
  magician: { src: '/archetype-magician.png', position: '50% 27%' },
  ruler: { src: '/archetype-ruler.png', position: '50% 23%' },
};

function ArchetypePortrait({ kind }: { kind: ArchetypeId }) {
  const archetype = archetypeDefinitions[kind];
  const portrait = archetypePortraits[kind];
  return (
    <span className={`archetype-photo-unit archetype-photo-${kind}`} aria-hidden="true">
      <span className="archetype-photo-circle">
        <img src={portrait.src} alt="" className="archetype-photo-image" style={{ objectPosition: portrait.position }} />
      </span>
      <span className="archetype-photo-plaque">
        <strong>{archetype.name}</strong>
      </span>
    </span>
  );
}

export function SystemModel({ elements, target = false }: { elements: ResolvedSystemElement[]; target?: boolean }) {
  return (
    <div className="system-model" aria-label={target ? 'Модель под вашу цель' : 'Текущая бизнес-модель'}>
      {elements.map((element) => {
        const result = element.current + (target ? element.added : 0);
        const currentTone = systemScoreTone(element.current);
        return (
          <div className="model-column" key={element.id}>
            <div className={`model-score ${target && element.added ? 'target-score' : currentTone}`}>{result}</div>
            <div className="brick-stack" aria-label={`${element.name}: ${result} из 10`}>
              {Array.from({ length: 10 }, (_, index) => {
                const level = 10 - index;
                const state =
                  level <= element.current
                    ? `current ${currentTone}`
                    : target && level <= element.current + element.added
                      ? 'added'
                      : 'empty';
                return <span className={`system-brick ${state}`} key={level} />;
              })}
            </div>
            <span className="model-number">{element.id}</span>
            <span className="model-name">{element.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ModelLegend({ includeTarget = true }: { includeTarget?: boolean }) {
  return (
    <div className="model-legend" aria-label="Обозначения цветов">
      <span><i className="legend-swatch current-swatch" />Текущий уровень</span>
      {includeTarget && <span><i className="legend-swatch target-swatch" />Что нужно достроить</span>}
      <span><i className="legend-swatch empty-swatch" />Потенциал роста</span>
    </div>
  );
}

function ArchetypeDialog({
  archetypeId,
  open,
  flipped,
  onFlip,
  onClose,
}: {
  archetypeId: ArchetypeId;
  open: boolean;
  flipped: boolean;
  onFlip: () => void;
  onClose: () => void;
}) {
  const archetype = archetypeDefinitions[archetypeId];
  const nextArchetype = archetype.nextId ? archetypeDefinitions[archetype.nextId] : null;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="archetype-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="archetype-dialog" role="dialog" aria-modal="true" aria-labelledby="archetype-card-title">
        <button type="button" className="archetype-close" aria-label="Закрыть карту архетипа" onClick={onClose} autoFocus>
          <span aria-hidden="true">×</span>
        </button>
        <div className={`archetype-flip-scene ${flipped ? 'is-flipped' : ''}`}>
          <button
            type="button"
            className="archetype-flip-card"
            onClick={onFlip}
            aria-label={flipped ? 'Показать лицевую сторону карты' : 'Показать ключ перехода'}
          >
            <span className="archetype-card-face archetype-card-front" aria-hidden={flipped}>
              <span className="archetype-card-eyebrow">Ваш бизнес-архетип</span>
              <span id="archetype-card-title" className="sr-only">{archetype.name}</span>
              <ArchetypePortrait kind={archetype.id} />
              <span className="archetype-card-quote">«{archetype.quote}»</span>
              <span className="archetype-here-caption">Ты здесь</span>
              <span className="archetype-card-hint">Нажмите на карту, чтобы увидеть ключ перехода</span>
            </span>

            <span className="archetype-card-face archetype-card-back" aria-hidden={!flipped}>
              <span className="archetype-card-eyebrow">
                {nextArchetype ? `${archetype.name} → ${nextArchetype.name}` : `${archetype.name} · устойчивый уровень`}
              </span>
              <span className="archetype-back-icon"><ArchetypeGlyph kind={nextArchetype?.id ?? archetype.id} /></span>
              <span className="archetype-back-section">
                <b>Ключ перехода</b>
                <strong>{archetype.transitionKey}</strong>
              </span>
              <span className="archetype-back-section actions">
                <b>Что важно сделать</b>
                {archetype.actions.map((action) => <span key={action}>{action}</span>)}
              </span>
              <span className="archetype-card-hint">Нажмите, чтобы перевернуть обратно</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Center of each archetype's portrait circle on business-archetype-map.png,
// as a fraction (0-1) of the image's own natural width/height. Measured by
// scanning the source PNG (2048x1152) for the gold ring around each portrait
// and taking the bounding-box center — not eyeballed. Update these if the
// map image is ever redrawn or repositioned.
const ARCHETYPE_MAP_POSITION: Record<ArchetypeId, { x: number; y: number }> = {
  altruist: { x: 0.138, y: 0.779 },
  explorer: { x: 0.368, y: 0.570 },
  creator: { x: 0.599, y: 0.604 },
  hero: { x: 0.802, y: 0.402 },
  magician: { x: 0.585, y: 0.143 },
  ruler: { x: 0.861, y: 0.109 },
};

// The map <img> can render narrower or shorter than its box (object-fit:
// contain + max-height in the enlarged dialog letterboxes it), so a plain
// CSS percentage on an overlay would drift off the portrait. Instead we
// measure the image's actual on-screen "contain" rectangle every time it
// resizes and place the marker in real pixels within that rectangle, which
// stays correct in both the small thumbnail and the enlarged dialog.
function useContainRect(imgRef: React.RefObject<HTMLImageElement | null>) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const measure = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const boxWidth = img.clientWidth;
      const boxHeight = img.clientHeight;
      if (!naturalWidth || !naturalHeight || !boxWidth || !boxHeight) return;
      const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
      const width = naturalWidth * scale;
      const height = naturalHeight * scale;
      setRect({ left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height });
    };

    measure();
    if (!img.complete) img.addEventListener('load', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(img);
    window.addEventListener('resize', measure);
    return () => {
      img.removeEventListener('load', measure);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [imgRef]);

  return rect;
}

// How far below the portrait's exact center the "Ты здесь" label sits, as a
// fraction of the image's on-screen height. Keeps the label clear of the
// face at both the small thumbnail and the enlarged dialog, since it's
// computed from the same real "contain" rectangle as the anchor point
// itself instead of a fixed pixel offset.
const HERE_LABEL_OFFSET_FRACTION = 0.09;

function EvolutionMapImage({ currentArchetypeId, className, alt }: { currentArchetypeId: ArchetypeId; className?: string; alt: string }) {
  const fraction = ARCHETYPE_MAP_POSITION[currentArchetypeId];
  const imgRef = useRef<HTMLImageElement>(null);
  const rect = useContainRect(imgRef);
  const markerStyle = rect
    ? { left: rect.left + fraction.x * rect.width, top: rect.top + fraction.y * rect.height }
    : undefined;
  const labelOffsetPx = rect ? rect.height * HERE_LABEL_OFFSET_FRACTION : 0;

  return (
    <span className="evolution-map-image-wrap">
      <img ref={imgRef} className={className} src="/business-archetype-map.png" alt={alt} />
      {markerStyle && (
        // The point itself stays anchored exactly on the portrait (a thin
        // stem marks it), but the dot + "Ты здесь" label are pushed below it
        // so nothing is drawn over the archetype's face.
        <span className="evolution-here-marker" style={markerStyle} aria-hidden="true">
          <span className="evolution-here-stem" style={{ height: labelOffsetPx }} />
          <span className="evolution-here-label" style={{ top: labelOffsetPx }}>
            <span className="evolution-here-dot" />
            <span className="evolution-here-text">Ты здесь</span>
          </span>
        </span>
      )}
    </span>
  );
}

export function EvolutionMap({ currentArchetypeId }: { currentArchetypeId: ArchetypeId }) {
  const [mapOpen, setMapOpen] = useState(false);
  const currentArchetype = archetypeDefinitions[currentArchetypeId];

  useEffect(() => {
    if (!mapOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMapOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mapOpen]);

  return (
    <section className="evolution-card" aria-labelledby="evolution-title">
      <div className="evolution-heading">
        <span className="result-kicker">Навигатор роста</span>
        <h3 id="evolution-title">Эволюция предпринимательского мышления</h3>
        <p>Не тип личности, а способ мышления, через который человек сейчас строит именно этот бизнес.</p>
      </div>
      <button
        type="button"
        className="evolution-map-button"
        onClick={() => setMapOpen(true)}
        aria-label={`Увеличить карту эволюции. Текущий архетип: ${currentArchetype.name}`}
      >
        <EvolutionMapImage
          currentArchetypeId={currentArchetypeId}
          alt="Карта эволюции предпринимательского мышления от Альтруиста к Правителю"
        />
        <span className="evolution-map-hint"><b aria-hidden="true">＋</b> Увеличить карту</span>
      </button>

      {mapOpen && (
        <div
          className="evolution-map-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMapOpen(false);
          }}
        >
          <div className="evolution-map-dialog" role="dialog" aria-modal="true" aria-label="Увеличенная карта эволюции предпринимательского мышления">
            <button type="button" className="evolution-map-close" onClick={() => setMapOpen(false)} aria-label="Закрыть карту" autoFocus>×</button>
            <EvolutionMapImage
              currentArchetypeId={currentArchetypeId}
              alt="Карта эволюции предпринимательского мышления от Альтруиста к Правителю"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export type AnalysisProgressStatus = Exclude<AnalysisRunStatus, 'draft' | 'analysis_failed' | 'money_now_prescribing'>;

export const analysisProgressByStatus: Record<AnalysisProgressStatus, {
  step: number;
  percent: number;
  title: string;
  detail: string;
}> = {
  queued: {
    step: 1,
    percent: 8,
    title: 'Алекс изучает вашу ситуацию',
    detail: 'Собираю из ответов цельную картину бизнеса и его текущих опор.',
  },
  scoring: {
    step: 1,
    percent: 12,
    title: 'Алекс изучает вашу ситуацию',
    detail: 'Собираю из ответов цельную картину бизнеса и его текущих опор.',
  },
  targeting: {
    step: 2,
    percent: 28,
    title: 'Собираю картину роста',
    detail: 'Определяю, на что уже можно опереться и какой уровень нужен для вашей цели.',
  },
  strategizing: {
    step: 3,
    percent: 42,
    title: 'Ищу главную связку роста',
    detail: 'Выбираю элементы, которые важно усиливать вместе, чтобы не распылять ресурс.',
  },
  resolving_tasks: {
    step: 4,
    percent: 60,
    title: 'Собираю последовательность действий',
    detail: 'Выстраиваю понятный маршрут от текущей ситуации к ближайшему результату.',
  },
  money_now: {
    step: 5,
    percent: 72,
    title: 'Проверяю связность плана',
    detail: 'Проверяю, что выводы, приоритеты и последовательность действий согласованы между собой.',
  },
  writing_report: {
    step: 6,
    percent: 88,
    title: 'Собираю индивидуальный план',
    detail: 'Собираю вашу карту перехода.',
  },
  ready: {
    step: 6,
    percent: 100,
    title: 'Разбор готов',
    detail: 'Завершаю сохранение результата в кабинете.',
  },
};

function formatAnalysisElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} мин ${remainder} сек` : `${minutes} мин`;
}

// Order the map is declared in doubles as the real pipeline sequence, so the
// "floor" percent for a stage is simply the previous stage's ceiling -- this
// keeps the meter continuous instead of jumping when the status changes.
const PROGRESS_SEQUENCE = Object.keys(analysisProgressByStatus) as AnalysisProgressStatus[];

// Total number of user-facing steps, derived from the same map that drives
// the percentages instead of a separate hardcoded literal -- if stages are
// ever added, split, or merged, the "Шаг X из N" label updates automatically
// instead of silently going stale.
const TOTAL_STEPS = Math.max(...Object.values(analysisProgressByStatus).map((entry) => entry.step));

// No historical average yet available (e.g. very first runs in a fresh
// environment) -- a conservative fallback so the meter still grows smoothly
// instead of freezing.
const FALLBACK_TOTAL_DURATION_MS = 90_000;

// Step 1 (queued -> scoring) is where the first pipeline module -- the one
// that scores the client's current system -- actually runs, and it alone
// typically takes about this long. The generic per-stage asymptotic meter
// below deliberately never lets a stage reach its own ceiling, which for
// this stage means the percent visibly gets stuck at 11% (one below
// `scoring`'s 12% ceiling) for the client's entire wait. Since this is the
// one stage with a known, fairly stable real-world duration, show real
// elapsed-time progress here instead: 50% at 1 minute, 75% at 1.5 minutes,
// capped at 99% past 2 minutes -- 100% is reserved for when the run is
// actually ready.
const FIRST_MODULE_DURATION_MS = 120_000;

function floorPercentFor(status: AnalysisProgressStatus): number {
  const index = PROGRESS_SEQUENCE.indexOf(status);
  if (index <= 0) return 0;
  return analysisProgressByStatus[PROGRESS_SEQUENCE[index - 1]].percent;
}

export function NeuroAnalysisScreen({
  analysisStatus = 'queued',
  startedAt = null,
  averageDurationMs = null,
}: {
  analysisStatus?: AnalysisProgressStatus;
  startedAt?: number | null;
  averageDurationMs?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const progress = analysisProgressByStatus[analysisStatus];
  const floorPercent = floorPercentFor(analysisStatus);

  // Tracks when the *current* stage was entered (not the whole run), purely
  // client-side: whenever the status prop changes, that moment becomes the
  // new stage start. This is what lets the percent keep climbing smoothly
  // within a stage instead of jumping straight to a fixed number and
  // sitting there until the next status arrives.
  const stageEnteredAtRef = useRef<number>(startedAt ?? Date.now());
  const previousStatusRef = useRef<AnalysisProgressStatus>(analysisStatus);
  if (previousStatusRef.current !== analysisStatus) {
    previousStatusRef.current = analysisStatus;
    stageEnteredAtRef.current = Date.now();
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  // Guards against ever showing a lower percent than the client already saw,
  // e.g. if step 1's real-time formula below happens to run ahead of the
  // next stage's fixed floor once the status actually advances.
  const maxDisplayedPercentRef = useRef(0);

  const displayPercent = useMemo(() => {
    if (analysisStatus === 'ready') {
      maxDisplayedPercentRef.current = 100;
      return 100;
    }

    let raw: number;
    if (progress.step === 1) {
      // First module (scoring the client's current system): real elapsed
      // time out of its ~2 minute typical duration, capped just short of
      // 100% so it never falsely claims to be done.
      const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
      raw = (elapsedMs / FIRST_MODULE_DURATION_MS) * 100;
    } else {
      const totalDurationMs = averageDurationMs && averageDurationMs > 0 ? averageDurationMs : FALLBACK_TOTAL_DURATION_MS;
      const stageShareMs = Math.max(1, (totalDurationMs * (progress.percent - floorPercent)) / 100);
      const stageElapsedMs = Math.max(0, now - stageEnteredAtRef.current);
      // Asymptotic approach to the stage's ceiling: keeps inching forward for
      // as long as the client waits, however long that turns out to be,
      // rather than freezing at a fixed value once the "expected" time has
      // passed -- but it never actually reaches the ceiling until the status
      // itself advances, so it can't show 100% before the run is really ready.
      const withinStage = 1 - Math.exp(-stageElapsedMs / stageShareMs);
      raw = floorPercent + (progress.percent - floorPercent) * withinStage;
    }

    const capped = Math.min(99, Math.round(raw));
    const value = Math.max(capped, maxDisplayedPercentRef.current);
    maxDisplayedPercentRef.current = value;
    return value;
  }, [analysisStatus, averageDurationMs, floorPercent, now, progress.percent, progress.step, startedAt]);

  return (
    <section className="diagnostic-card neuro-screen" aria-live="polite" aria-busy="true">
      <div className="alex-portrait-wrap">
        <div className="alex-portrait" role="img" aria-label="Нейро-маркетолог Алекс" />
        <span className="alex-brain-badge" aria-hidden="true">
          <BrainIcon className="alex-brain-icon" />
        </span>
      </div>
      <span className="neuro-badge">
        <BrainIcon className="neuro-badge-brain" /> Нейро-анализ
      </span>
      <p className="neuro-status-title">{progress.title}</p>
      <p className="neuro-status-copy">{progress.detail}</p>
      <div className="neuro-progress">
        <span className="neuro-spinner" aria-hidden="true" />
        <div>
          <strong>{`Шаг ${progress.step} из ${TOTAL_STEPS} · ${formatAnalysisElapsed(elapsedSeconds)}`}</strong>
          <span>{`${displayPercent}% выполнено`}</span>
        </div>
      </div>
      <div
        className="neuro-progress-meter"
        role="progressbar"
        aria-label="Прогресс анализа"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayPercent}
      >
        <span style={{ width: `${displayPercent}%` }} />
      </div>
      <p className="neuro-duration-note">
        Первая часть разбора откроется сразу после оценки текущей системы. Полный план продолжит собираться в фоне.
        Анкета уже сохранена, повторно отправлять её не нужно.
      </p>
    </section>
  );
}

// A shorter, non-pipeline-tracked variant of NeuroAnalysisScreen for brief
// page-to-page transitions (e.g. Разбор -> План перехода) where there is no
// real multi-step progress to report, just a moment of fetch latency the
// brand wants to bridge with the same "Алекс" visual identity.
export function NeuroTransitionScreen({
  title,
  detail,
  durationMs = 1400,
}: {
  title: string;
  detail: string;
  durationMs?: number;
}) {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setProgress(92));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="diagnostic-card neuro-screen" aria-live="polite" aria-busy="true">
      <div className="alex-portrait-wrap">
        <div className="alex-portrait" role="img" aria-label="Нейро-маркетолог Алекс" />
        <span className="alex-brain-badge" aria-hidden="true">
          <BrainIcon className="alex-brain-icon" />
        </span>
      </div>
      <span className="neuro-badge">
        <BrainIcon className="neuro-badge-brain" /> Нейро-анализ
      </span>
      <p className="neuro-status-title">{title}</p>
      <p className="neuro-status-copy">{detail}</p>
      <div className="neuro-progress">
        <span className="neuro-spinner" aria-hidden="true" />
      </div>
      <div
        className="neuro-progress-meter"
        role="progressbar"
        aria-label="Загрузка"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%`, transitionDuration: `${durationMs}ms` }} />
      </div>
    </section>
  );
}

export type AnalysisGrowthBundlePreview = {
  core: SevenKElementId[];
  supporting: SevenKElementId[];
  currentScores: SevenKScores;
  targetScores: SevenKScores;
  title: string;
  explanation: string;
  // Elements deliberately left at their current level for this transition --
  // same "Пока не трогаем как отдельное направление" section shown on the
  // manager's saved result page, reused here so the live view under the
  // target model matches it exactly.
  paused: { elementId: SevenKElementId; text: string; returnTrigger: string | null }[];
};

function elementName(elementId: SevenKElementId): string {
  return SEVEN_K_ELEMENTS.find((element) => element.id === elementId)?.name ?? elementId;
}

function GrowthBundleCard({
  role,
  elementId,
  bundle,
}: {
  role: 'Ключевой элемент' | 'Поддерживающий элемент';
  elementId: SevenKElementId;
  bundle: AnalysisGrowthBundlePreview;
}) {
  return (
    <article>
      <small>{role}</small>
      <h4>{elementName(elementId)}</h4>
      <em>{bundle.currentScores[elementId]} → {bundle.targetScores[elementId]}</em>
      <span className="growth-bundle-lever">{SEVEN_K_BUSINESS_LEVERS[elementId]}</span>
    </article>
  );
}

function GrowthBundlePreview({ bundle }: { bundle: AnalysisGrowthBundlePreview | null }) {
  if (!bundle) {
    return (
      <aside className="growth-bundle-forming" aria-live="polite">
        <span className="admin-eyebrow">Связка для перехода к денежной цели</span>
        <h3>Ключевая связка формируется</h3>
        <p>Алекс собирает, какие элементы системы важно усиливать вместе, чтобы не распылять ресурс.</p>
        <div className="growth-bundle-skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      </aside>
    );
  }
  return (
    <>
      <section className="result-section growth-bundle-section growth-bundle-preview">
        <div className="result-section-heading">
          <span>03</span>
          <div>
            <h2>Связка для перехода к денежной цели</h2>
            <p>Эти элементы усиливаются вместе. Остальные не забыты, но сейчас не должны забирать ресурс.</p>
          </div>
        </div>
        <div className="growth-priority-groups">
          <section>
            <h3>Ключевая связка</h3>
            <div className="growth-bundle-line">
              {bundle.core.map((elementId, index) => (
                <div className="growth-bundle-item" key={elementId}>
                  {index > 0 && <span>+</span>}
                  <GrowthBundleCard role="Ключевой элемент" elementId={elementId} bundle={bundle} />
                </div>
              ))}
            </div>
          </section>
          {bundle.supporting.length > 0 && (
            <section>
              <h3>Поддерживающие элементы</h3>
              <div className="growth-bundle-line supporting">
                {bundle.supporting.map((elementId, index) => (
                  <div className="growth-bundle-item" key={elementId}>
                    {index > 0 && <span>+</span>}
                    <GrowthBundleCard role="Поддерживающий элемент" elementId={elementId} bundle={bundle} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="growth-bundle-explanation">
          <span className="admin-eyebrow">Почему именно эта связка</span>
          <h3>{bundle.title}</h3>
          <p>{bundle.explanation}</p>
        </div>
      </section>
      {bundle.paused.length > 0 && (
        <section className="result-section why-not-now-section">
          <div className="result-section-heading">
            <span>04</span>
            <div>
              <h2>Пока не трогаем как отдельное направление</h2>
              <p>Эти элементы остаются на текущем уровне и не забирают ресурс ближайшего перехода.</p>
            </div>
          </div>
          <div className="why-not-now-grid">
            {bundle.paused.map((item) => (
              <article key={item.elementId}>
                <strong>{elementName(item.elementId)}</strong>
                <p>{item.text}</p>
                {item.returnTrigger && <small>Вернуться, когда: {item.returnTrigger}</small>}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function AnalysisSection({
  overview,
  growthBundle,
  onOpenPlan,
  onRetryPlan,
  onStartOver,
  planReady,
  progressStatus,
  failureMessage,
  failureRecoverable,
  retrying,
}: {
  overview: AnalysisOverview;
  // Null until the run is fully ready -- the bundle's descriptive text is
  // only written by the final pipeline stage, so there is no meaningful
  // partial version to show earlier. Renders a "forming" placeholder until then.
  growthBundle: AnalysisGrowthBundlePreview | null;
  onOpenPlan: () => void;
  onRetryPlan: () => void;
  onStartOver: () => void;
  planReady: boolean;
  progressStatus: AnalysisProgressStatus;
  // Non-null whenever the run is in a persisted `analysis_failed` state with
  // a usable overview (a post-targeting P-02/P-04 failure) -- this must
  // reflect the SERVER's persisted status, not just an in-session mutation
  // error, so reopening /analysis/:id after a reload still shows the real
  // failure/retry state instead of a misleading "plan still building" one.
  failureMessage: string | null;
  // Only P-02/P-04 failures (excluding P02_NO_ACTIONABLE_TARGET_GAP) can be
  // retried in place; other failures need a fresh diagnostic submission.
  failureRecoverable: boolean;
  retrying: boolean;
}) {
  const pointerStart = useRef<number | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [archetypeFlipped, setArchetypeFlipped] = useState(false);
  const systemElements = useMemo(
    () => resolveSystemElements(overview.systemScores as SystemScore[]),
    [overview.systemScores],
  );
  const currentTotal = systemElements.reduce((sum, element) => sum + element.current, 0);
  const currentModelGroups = useMemo(
    () => buildCurrentSystemSummary(overview.systemScores as SystemScore[]),
    [overview.systemScores],
  );
  const archetypeId = overview.archetype.id as ArchetypeId;
  const archetype = archetypeDefinitions[archetypeId];
  const slideCount = 2;
  const showSlide = (slide: number) => setActiveSlide(Math.max(0, Math.min(slideCount - 1, slide)));
  const closeArchetype = () => {
    setArchetypeOpen(false);
    setArchetypeFlipped(false);
  };

  const finishSwipe = (clientX: number) => {
    if (pointerStart.current === null) return;
    const distance = pointerStart.current - clientX;
    pointerStart.current = null;
    if (Math.abs(distance) < 55) return;
    showSlide(activeSlide + (distance > 0 ? 1 : -1));
  };

  return (
    <section className="diagnostic-card analysis-card" aria-labelledby="analysis-title">
      <button
        type="button"
        className="archetype-trigger"
        aria-label={`Открыть карту бизнес-архетипа ${archetype.name}`}
        onClick={() => {
          setArchetypeFlipped(false);
          setArchetypeOpen(true);
        }}
      >
        <ArchetypeMedallion kind={archetype.id} className="trigger-medallion" />
        <span>
          <small>Ваш архетип</small>
          <strong>{archetype.name}</strong>
        </span>
      </button>

      <div className="analysis-heading">
        <span className="analysis-kicker">Шаг 2 · Разбор</span>
        <h2 id="analysis-title">Бизнес-модель <span>7К</span></h2>
        <strong className="analysis-method-subtitle">Система пошагового роста эксперта</strong>
        <p>Показывает, как шаг за шагом построить сильную аутентичную систему. Сравните текущую модель с моделью под вашу цель и посмотрите, какие элементы важно достроить.</p>
        <span className="analysis-context-chip">Итоговый балл: <strong>{currentTotal}</strong><span>из 70</span></span>
      </div>

      <div className="analysis-carousel">
        <button
          type="button"
          className="analysis-arrow analysis-arrow-left"
          aria-label="Предыдущий экран"
          disabled={activeSlide === 0}
          onClick={() => showSlide(activeSlide - 1)}
        >
          <ChevronIcon direction="left" />
        </button>

        <div
          className="analysis-viewport"
          tabIndex={0}
          aria-roledescription="карусель"
          aria-label="Визуализация бизнес-системы"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') showSlide(activeSlide - 1);
            if (event.key === 'ArrowRight') showSlide(activeSlide + 1);
          }}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("summary, button, a, input, select, textarea, [role='button']")) {
              pointerStart.current = null;
              return;
            }
            pointerStart.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => finishSwipe(event.clientX)}
          onPointerCancel={() => { pointerStart.current = null; }}
        >
          <div className="analysis-track" style={{ transform: `translate3d(-${activeSlide * 100}%, 0, 0)` }}>
            <article className="analysis-slide" aria-hidden={activeSlide !== 0}>
              <div className="analysis-slide-heading">
                <span>01</span>
                <h3>Текущая модель 7К</h3>
              </div>
              <SystemModel elements={systemElements} />
              <aside className="current-score-rationale" aria-label="Обоснование текущих баллов">
                <div className="current-system-conclusion" aria-label="Вывод о мягких и твёрдых элементах системы">
                  <article className="soft">
                    <span>Мягкие элементы системы</span>
                    <p>{currentModelGroups.soft}</p>
                  </article>
                  <article className="hard">
                    <span>Твёрдые элементы системы</span>
                    <p>{currentModelGroups.hard}</p>
                  </article>
                </div>
              </aside>
            </article>

            <article className="analysis-slide" aria-hidden={activeSlide !== 1}>
              <div className="analysis-slide-heading">
                <span>02</span>
                <h3>Бизнес-модель под вашу цель</h3>
              </div>
              <ModelLegend />
              <SystemModel elements={systemElements} target />
              {overview.modelTransitionNote && (
                <aside className="target-horizon-note">
                  <strong>Почему не строим всю далёкую модель сразу</strong>
                  <p>{overview.modelTransitionNote}</p>
                </aside>
              )}
            </article>
          </div>
        </div>

        <button
          type="button"
          className="analysis-arrow analysis-arrow-right"
          aria-label="Следующий экран"
          disabled={activeSlide === slideCount - 1}
          onClick={() => showSlide(activeSlide + 1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="analysis-pagination" aria-label="Экраны разбора">
        {['Текущая модель 7К', 'Бизнес-модель под вашу цель'].map((label, index) => (
          <button
            type="button"
            className={activeSlide === index ? 'active' : ''}
            aria-label={`Показать: ${label}`}
            aria-current={activeSlide === index ? 'true' : undefined}
            onClick={() => showSlide(index)}
            key={label}
          />
        ))}
      </div>
      <p className="analysis-counter" aria-live="polite">{activeSlide + 1} / {slideCount}</p>

      <EvolutionMap currentArchetypeId={archetype.id} />

      <GrowthBundlePreview bundle={growthBundle} />

      <div className={`route-action-wrap ${planReady ? 'is-ready' : 'is-building'}`} aria-live="polite">
        <span>{failureMessage ? 'Нужна повторная попытка' : planReady ? 'Следующий шаг' : 'План продолжает собираться'}</span>
        <h3>
          {failureMessage
            ? 'Разбор уже сохранён, но план перехода пока не собран'
            : planReady
              ? 'Посмотреть, в какой последовательности усиливать систему'
              : analysisProgressByStatus[progressStatus].detail}
        </h3>
        <p>
          {failureMessage
            ? (failureRecoverable
              ? 'Ответы и первая часть разбора сохранены. План можно собрать повторно, не заполняя анкету заново.'
              : `${failureMessage} Эта ошибка не устраняется повтором — заполните анкету ещё раз с более подробными ответами.`)
            : planReady
              ? 'Все рекомендации и задачи готовы.'
              : 'Текущая и целевая модели уже готовы — их можно обсуждать с клиентом, пока система собирает рекомендации.'}
        </p>
        {failureMessage && !failureRecoverable ? (
          <button type="button" className="primary-button route-button" onClick={onStartOver}>
            Заполнить заново
          </button>
        ) : (
          <button
            type="button"
            className="primary-button route-button"
            onClick={failureMessage ? onRetryPlan : onOpenPlan}
            disabled={retrying || (!planReady && !failureMessage)}
          >
            {retrying ? 'Собираем план…' : failureMessage ? 'Повторить сборку плана' : planReady ? 'Маршрут перехода' : 'План ещё собирается'}
            {(planReady || failureMessage) && <ArrowIcon />}
          </button>
        )}
      </div>

      <ArchetypeDialog
        archetypeId={archetype.id}
        open={archetypeOpen}
        flipped={archetypeFlipped}
        onFlip={() => setArchetypeFlipped((current) => !current)}
        onClose={closeArchetype}
      />
    </section>
  );
}

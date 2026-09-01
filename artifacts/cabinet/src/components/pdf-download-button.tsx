import { useState } from 'react';

const PDF_TEXT_PAGE_PIXEL_RATIO = 2.75;
const PDF_IMAGE_PAGE_PIXEL_RATIO = 4.5;

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').replace(/\s+/gu, '-');
  return `${normalized || 'Индивидуальный-план-7К'}.pdf`;
}

function collectPrintRules(): string {
  const collected: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSMediaRule && /(^|\s|,)print(\s|,|$)/u.test(rule.conditionText)) {
          collected.push(Array.from(rule.cssRules).map((nestedRule) => nestedRule.cssText).join('\n'));
        }
      }
    } catch {
      // Cross-origin styles are not required for the local PDF template.
    }
  }
  return collected.join('\n');
}

async function waitForImages(root: HTMLElement): Promise<void> {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    image.loading = 'eager';
    const settled = new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
    // Images inside the normally hidden print template can remain indefinitely
    // deferred by native lazy-loading. Reassigning the resolved URL starts the
    // request, while the timeout keeps PDF export fail-open for an unavailable
    // decorative image instead of leaving the manager on "Собираю PDF…".
    const source = image.currentSrc || image.src;
    if (source) image.src = source;
    await Promise.race([
      settled,
      new Promise<void>((resolve) => window.setTimeout(resolve, 5_000)),
    ]);
  }));
}

const CHECKLIST_MIN_SCALE = 0.6;
const CHECKLIST_SCALE_STEP = 0.08;
// Properties that actually influence layout height (unlike `transform`,
// which only affects paint) and that the print stylesheet uses on task-list
// typography. Shrinking these genuinely reduces the space the list — and by
// extension the shared grid row with the neuro-recommendation card — needs.
const CHECKLIST_SCALED_PROPERTIES = ['fontSize', 'marginTop', 'marginBottom', 'lineHeight', 'rowGap'] as const;

function checklistOverflows(list: HTMLElement, card: HTMLElement): boolean {
  const lastItem = list.lastElementChild;
  const overflowsList = list.scrollHeight > list.clientHeight + 1;
  const overflowsCard = Boolean(lastItem
    && lastItem.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom - 1);
  return overflowsList || overflowsCard;
}

function captureScaleBaseline(list: HTMLElement): Map<HTMLElement, Partial<Record<typeof CHECKLIST_SCALED_PROPERTIES[number], number>>> {
  const baseline = new Map<HTMLElement, Partial<Record<typeof CHECKLIST_SCALED_PROPERTIES[number], number>>>();
  const elements: HTMLElement[] = [list, ...Array.from(list.querySelectorAll<HTMLElement>('strong, span, p'))];
  for (const element of elements) {
    const computed = getComputedStyle(element);
    const values: Partial<Record<typeof CHECKLIST_SCALED_PROPERTIES[number], number>> = {};
    for (const property of CHECKLIST_SCALED_PROPERTIES) {
      const parsed = parseFloat(computed[property]);
      if (Number.isFinite(parsed) && parsed > 0) values[property] = parsed;
    }
    baseline.set(element, values);
  }
  return baseline;
}

function applyScale(baseline: Map<HTMLElement, Partial<Record<typeof CHECKLIST_SCALED_PROPERTIES[number], number>>>, factor: number): void {
  for (const [element, values] of baseline) {
    for (const property of CHECKLIST_SCALED_PROPERTIES) {
      const base = values[property];
      if (base === undefined) continue;
      // getComputedStyle always resolves these properties (including
      // line-height, even when authored unitless) to pixel values, so every
      // scaled value must be re-applied in px too — setting a bare number
      // back onto line-height would be interpreted as a unitless multiplier
      // of font-size instead, ballooning the line spacing.
      (element.style as unknown as Record<string, string>)[property] = `${(base * factor).toFixed(2)}px`;
    }
  }
}

function fitOverflowingChecklistCards(root: HTMLElement): () => void {
  const resets: Array<() => void> = [];
  for (const list of Array.from(root.querySelectorAll<HTMLElement>('.analysis-pdf-task-list'))) {
    const card = list.closest<HTMLElement>('.analysis-pdf-checklist-card');
    if (!card || !checklistOverflows(list, card)) continue;

    list.classList.add('is-overflowing');
    resets.push(() => list.classList.remove('is-overflowing'));
    if (!checklistOverflows(list, card)) continue;

    // Unusually long checklists (many transition tasks for one element) can
    // still overflow the fixed-height print card even after the CSS-only
    // density reduction above. Because the task list and the neuro-card sit
    // in the same fixed-height grid row, an overflowing list stretches the
    // whole row and pushes the neuro-card's caption box out of the visible,
    // clipped area. Progressively shrink the list's real typography (not a
    // paint-only transform) so its layout height actually shrinks and the
    // row no longer needs to grow.
    const baseline = captureScaleBaseline(list);
    let scale = 1;
    while (checklistOverflows(list, card) && scale > CHECKLIST_MIN_SCALE) {
      scale = Math.max(CHECKLIST_MIN_SCALE, scale - CHECKLIST_SCALE_STEP);
      applyScale(baseline, scale);
    }
    resets.push(() => {
      for (const element of baseline.keys()) {
        for (const property of CHECKLIST_SCALED_PROPERTIES) {
          (element.style as unknown as Record<string, string>)[property] = '';
        }
      }
    });
  }
  return () => resets.reverse().forEach((reset) => reset());
}

async function downloadPdf(fileName: string): Promise<void> {
  const root = document.querySelector<HTMLElement>('.analysis-pdf');
  if (!root) throw new Error('Макет PDF не найден. Обновите страницу и попробуйте снова.');

  const printRules = collectPrintRules();
  if (!printRules) throw new Error('Не удалось загрузить оформление PDF.');

  const printStyle = document.createElement('style');
  printStyle.dataset.pdfExportStyles = 'true';
  printStyle.textContent = printRules;
  document.head.append(printStyle);
  document.body.classList.add('is-exporting-pdf');
  let resetChecklistLayout: () => void = () => undefined;

  try {
    await document.fonts.ready;
    await waitForImages(root);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    resetChecklistLayout = fitOverflowingChecklistCards(root);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const [{ toJpeg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
    const pages = Array.from(root.querySelectorAll<HTMLElement>('.analysis-pdf-page'));
    if (pages.length === 0) throw new Error('В плане нет страниц для выгрузки.');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      const containsImages = pages[index].querySelector('img') !== null;
      const image = await toJpeg(pages[index], {
        backgroundColor: '#fff9fb',
        // The approved PDF template uses system Arial, so walking every
        // application stylesheet and embedding unrelated webfonts for each
        // of the eight pages only makes export slower and less reliable.
        skipFonts: true,
        cacheBust: false,
        // Text-only pages are rendered a little above 2K. Pages containing
        // portraits are rendered close to 4K so the 1K-2K source artwork is
        // preserved at print quality instead of being downsampled.
        pixelRatio: containsImages ? PDF_IMAGE_PAGE_PIXEL_RATIO : PDF_TEXT_PAGE_PIXEL_RATIO,
        quality: 0.98,
      });
      if (index > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    pdf.save(safeFileName(fileName));
  } finally {
    resetChecklistLayout();
    document.body.classList.remove('is-exporting-pdf');
    printStyle.remove();
  }
}

export function PdfDownloadButton({ fileName }: { fileName: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return <div className="pdf-download-control no-print">
    <button
      type="button"
      className="admin-button primary"
      disabled={downloading}
      onClick={() => {
        setDownloading(true);
        setError(null);
        void downloadPdf(fileName)
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось сохранить PDF.'))
          .finally(() => setDownloading(false));
      }}
    >
      {downloading ? 'Собираю PDF…' : 'Сохранить план в PDF'}
    </button>
    {error && <span role="alert">{error}</span>}
  </div>;
}

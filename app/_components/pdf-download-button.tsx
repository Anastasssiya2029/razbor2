"use client";

import { useState } from "react";

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").replace(/\s+/gu, "-");
  return `${normalized || "Индивидуальный-план-7К"}.pdf`;
}

function collectPrintRules(): string {
  const collected: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSMediaRule && /(^|\s|,)print(\s|,|$)/u.test(rule.conditionText)) {
          collected.push(Array.from(rule.cssRules).map((nestedRule) => nestedRule.cssText).join("\n"));
        }
      }
    } catch {
      // Cross-origin styles are not required for the local PDF template.
    }
  }
  return collected.join("\n");
}

async function waitForImages(root: HTMLElement): Promise<void> {
  await Promise.all(Array.from(root.querySelectorAll("img")).map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}

async function downloadPdf(fileName: string): Promise<void> {
  const root = document.querySelector<HTMLElement>(".analysis-pdf");
  if (!root) throw new Error("Макет PDF не найден. Обновите страницу и попробуйте снова.");

  const printRules = collectPrintRules();
  if (!printRules) throw new Error("Не удалось загрузить оформление PDF.");

  const printStyle = document.createElement("style");
  printStyle.dataset.pdfExportStyles = "true";
  printStyle.textContent = printRules;
  document.head.append(printStyle);
  document.body.classList.add("is-exporting-pdf");

  try {
    await document.fonts.ready;
    await waitForImages(root);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
    const pages = Array.from(root.querySelectorAll<HTMLElement>(".analysis-pdf-page"));
    if (pages.length === 0) throw new Error("В плане нет страниц для выгрузки.");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      const image = await toJpeg(pages[index], {
        backgroundColor: "#fff9fb",
        cacheBust: true,
        pixelRatio: 1.45,
        quality: 0.94,
      });
      if (index > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(image, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }
    pdf.save(safeFileName(fileName));
  } finally {
    document.body.classList.remove("is-exporting-pdf");
    printStyle.remove();
  }
}

export function PdfDownloadButton({ fileName }: { fileName: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return <div className="pdf-download-control no-print">
    <button
      type="button"
      className="primary-button compact"
      disabled={downloading}
      onClick={() => {
        setDownloading(true);
        setError(null);
        void downloadPdf(fileName)
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Не удалось сохранить PDF."))
          .finally(() => setDownloading(false));
      }}
    >
      {downloading ? "Собираю PDF…" : "Сохранить план в PDF"}
    </button>
    {error && <span role="alert">{error}</span>}
  </div>;
}

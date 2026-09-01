import type { SystemElementId, SystemScore } from "./business-analysis";

export type CurrentSystemSummary = {
  soft: string;
  hard: string;
};

const SOFT_IDS = new Set<SystemElementId>(["authenticity", "audience"]);

function scoreFor(scores: readonly SystemScore[], elementId: SystemElementId): number {
  return scores.find((score) => score.id === elementId)?.currentScore ?? 0;
}

function softSummary(authenticity: number, audience: number): string {
  if (authenticity <= 3 && audience <= 3) {
    return "Пока не собраны две основы продаж: ясное «почему я» и подтверждённое понимание клиента, который готов заплатить именно этому эксперту.";
  }
  if (authenticity >= 7 && audience >= 7) {
    return "Эксперт ясно понимает свою ценность и своего клиента и последовательно соединяет это в продукте, продаже и коммуникации.";
  }
  if (authenticity >= 4 && audience <= 3) {
    return "Эксперт уже понимает свои сильные стороны, но ещё не подтвердил, кому и за какой результат готовы платить.";
  }
  if (authenticity <= 3 && audience >= 4) {
    return "Клиент описан достаточно ясно, но пока не собрано убедительное «почему именно я».";
  }
  return "Эксперт и клиент уже понятны, но эта связка ещё не везде одинаково проявляется в продукте, продаже и коммуникации.";
}

function hardSummary(values: readonly number[]): string {
  const lowCount = values.filter((score) => score <= 3).length;
  const strongCount = values.filter((score) => score >= 7).length;
  const workingCount = values.filter((score) => score >= 4).length;

  if (strongCount >= 4) {
    return "Продукт, продажи, привлечение и исполнение связаны и дают повторяемый результат.";
  }
  if (strongCount === 1 && lowCount >= 3) {
    return "Один механизм уже развит, но пока работает отдельно и не поддерживается остальной системой.";
  }
  if (lowCount >= 4) {
    return "Есть отдельные работающие действия, но они пока не соединены в повторяемую систему.";
  }
  if (lowCount >= 2 && workingCount >= 2) {
    return "Часть механики уже создана, но рост ограничивают слабые связи между продуктом, продажей, привлечением и исполнением.";
  }
  return "Основные механизмы работают, но результат ещё зависит от ручного участия владельца.";
}

export function buildCurrentSystemSummary(scores: readonly SystemScore[]): CurrentSystemSummary {
  const hardScores = scores
    .filter((score) => !SOFT_IDS.has(score.id))
    .map((score) => score.currentScore);
  return {
    soft: softSummary(scoreFor(scores, "authenticity"), scoreFor(scores, "audience")),
    hard: hardSummary(hardScores),
  };
}

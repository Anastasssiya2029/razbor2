export type GiftTariff = "self" | "support";

export type GiftPrize = {
  code: string;
  label: string;
  shortName: string;
  wheelLabel: readonly string[];
  wheelTone: "light" | "dark" | "accent";
  weight: number;
  grand?: true;
};

export const GIFT_CATALOG: Record<GiftTariff, readonly GiftPrize[]> = {
  self: [
    { code: "self_neuro_photo", label: "Мини‑курс «Нейрофотосессия»", shortName: "МК «Нейрофотосессия»", wheelLabel: ["Мини‑курс", "«Нейрофотосессия»"], wheelTone: "light", weight: 30 },
    { code: "self_marketer_review", label: "Разбор с маркетологом", shortName: "Разбор с маркетологом", wheelLabel: ["Разбор с", "маркетологом"], wheelTone: "accent", weight: 1, grand: true },
    { code: "self_uniqueness", label: "Вебинар «Уникальность» + распаковка с экспертом", shortName: "Вебинар «Уникальность» + распаковка", wheelLabel: ["Вебинар", "«Уникальность»", "+ распаковка", "с экспертом"], wheelTone: "light", weight: 5 },
    { code: "self_curator", label: "Чат с куратором на 1 месяц + 1 год доступа", shortName: "Чат + 1 год доступа", wheelLabel: ["Чат с куратором", "на 1 месяц +", "1 год доступа"], wheelTone: "dark", weight: 1 },
    { code: "self_audience", label: "Вебинар «Своя ЦА»", shortName: "Вебинар «Своя ЦА»", wheelLabel: ["Вебинар", "«Своя ЦА»"], wheelTone: "light", weight: 23 },
    { code: "self_product", label: "Вебинар «Продукты и метод»", shortName: "Вебинар «Продукты и метод»", wheelLabel: ["Вебинар", "«Продукты и метод»"], wheelTone: "dark", weight: 22 },
    { code: "self_avatar", label: "Мини‑курс «Цифровой Аватар»", shortName: "МК «Цифровой Аватар»", wheelLabel: ["Мини‑курс", "«Цифровой Аватар»"], wheelTone: "light", weight: 10 },
    { code: "self_funnel", label: "Вебинар «Воронка продаж»", shortName: "Вебинар «Воронка продаж»", wheelLabel: ["Вебинар", "«Воронка продаж»"], wheelTone: "dark", weight: 8 },
  ],
  support: [
    { code: "support_neuro_photo", label: "Мини‑курс «Нейрофотосессия» + 1 месяц доступа к нейросети", shortName: "МК «Нейрофотосессия» + нейросеть", wheelLabel: ["Мини‑курс", "«Нейрофотосессия»", "+ 1 месяц доступа", "к нейросети"], wheelTone: "light", weight: 20 },
    { code: "support_anastasia", label: "Разбор с Анастасией", shortName: "Разбор с Анастасией", wheelLabel: ["Разбор с", "Анастасией"], wheelTone: "accent", weight: 1, grand: true },
    { code: "support_uniqueness_audience", label: "Вебинары «Уникальность» и «Своя ЦА»", shortName: "«Уникальность» + «Своя ЦА»", wheelLabel: ["Вебинары", "«Уникальность»", "и «Своя ЦА»"], wheelTone: "light", weight: 10 },
    { code: "support_bundle", label: "2 мини‑продукта и 4 вебинара", shortName: "2 мини‑продукта и 4 вебинара", wheelLabel: ["2 мини‑продукта", "и 4 вебинара"], wheelTone: "dark", weight: 15 },
    { code: "support_marketer_review", label: "Разбор с маркетологом", shortName: "Разбор с маркетологом", wheelLabel: ["Разбор с", "маркетологом"], wheelTone: "light", weight: 10 },
    { code: "support_gpt", label: "Аккаунт GPT с оплаченной подпиской на 1 год", shortName: "Аккаунт GPT на 1 год", wheelLabel: ["Аккаунт GPT", "с подпиской", "на 1 год"], wheelTone: "dark", weight: 4 },
    { code: "support_product", label: "Вебинар «Продукты и метод»", shortName: "Вебинар «Продукты и метод»", wheelLabel: ["Вебинар", "«Продукты и метод»"], wheelTone: "light", weight: 10 },
    { code: "support_month", label: "+1 месяц сопровождения", shortName: "+1 месяц сопровождения", wheelLabel: ["+1 месяц", "сопровождения"], wheelTone: "dark", weight: 30 },
  ],
};

export function selectGiftPrize(tariff: GiftTariff, randomValue: number): GiftPrize {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("randomValue must be in [0, 1)");
  }
  const prizes = GIFT_CATALOG[tariff];
  const totalWeight = prizes.reduce((total, prize) => total + prize.weight, 0);
  let cursor = randomValue * totalWeight;
  for (const prize of prizes) {
    cursor -= prize.weight;
    if (cursor < 0) return prize;
  }
  return prizes[prizes.length - 1];
}

export function secureRandomFraction(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 0x1_0000_0000;
}

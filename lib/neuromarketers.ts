import type { SevenKElementId } from "@/server/7k/types";

export const NEUROMARKETERS = {
  soula: { name: "Смысловик Соула", image: "/neuromarketer-soula.png", description: "Раскроет уникальность, авторский стиль и его уверенную трансляцию во всех точках контакта." },
  goal: { name: "Аналитик ЦА Гоал", image: "/neuromarketer-goal.png", description: "Поможет определить аудиторию, с которой интересно работать и которая ценит предложение." },
  olga: { name: "Методолог Ольга", image: "/neuromarketer-olga.png", description: "Упакует авторский метод в систему продуктов и логичную линейку услуг." },
  chloe: { name: "РОП Хлоя", image: "/neuromarketer-chloe.png", description: "Поможет внедрить технологию продаж, квалификацию и коммуникацию с высокой конверсией." },
  alex: { name: "Маркетолог Алекс", image: "/neuromarketer-alex.png", description: "Соберёт воронку привлечения и свяжет элементы системы в единый путь клиента." },
  pusha: { name: "SMM‑щик Пуша", image: "/neuromarketer-pusha.png", description: "Упакует контент в авторский стиль и превратит блог в часть продающей воронки." },
} as const;

export type NeuromarketerId = keyof typeof NEUROMARKETERS;

export const ELEMENT_NEUROMARKETERS: Record<SevenKElementId, readonly NeuromarketerId[]> = {
  authenticity: ["soula"],
  audience: ["goal"],
  product_method: ["olga"],
  sales_technology: ["chloe"],
  funnel: ["alex"],
  blog: ["pusha"],
  team: ["soula", "goal", "olga", "chloe", "alex", "pusha"],
};

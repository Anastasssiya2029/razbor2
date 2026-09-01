import type { SevenKElementId } from "./server/7k/types";

export const NEUROMARKETERS = {
  soula: { name: "Смысловик Соула", image: "/neuromarketer-soula.png", description: "Раскроет вашу уникальность, найдёт авторский стиль и научит уверенно транслировать его во всех точках контакта с клиентом." },
  goal: { name: "Аналитик ЦА Гоал", image: "/neuromarketer-goal.png", description: "Проанализирует и найдёт вашу идеальную целевую аудиторию, с которой вам интересно работать и которая будет вас ценить." },
  olga: { name: "Методолог Ольга", image: "/neuromarketer-olga.png", description: "Разработает авторский метод, упакует его в систему продающих продуктов и выстроит логичную линейку услуг." },
  chloe: { name: "РОП Хлоя", image: "/neuromarketer-chloe.png", description: "Разработает эффективные скрипты переписки и квалификации и поможет внедрить технологию продаж с высокой конверсией." },
  alex: { name: "Маркетолог Алекс", image: "/neuromarketer-alex.png", description: "Создаст эффективную воронку привлечения клиентов и выстроит связь между всеми элементами вашей системы." },
  pusha: { name: "SMM-щик Пуша", image: "/neuromarketer-pusha.png", description: "Упакует контент в авторский стиль и превратит блог в часть продающей воронки, которая регулярно приводит клиентов." },
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

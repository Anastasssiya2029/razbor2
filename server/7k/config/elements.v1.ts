import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "../types";

export const ELEMENTS_RESOURCE_VERSION = "elements.v1" as const;

export type SevenKElementDefinition = {
  id: SevenKElementId;
  displayOrder: number;
  name: string;
};

export const SEVEN_K_ELEMENTS = [
  { id: "authenticity", displayOrder: 1, name: "Аутентичность" },
  { id: "audience", displayOrder: 2, name: "Своя ЦА" },
  { id: "product_method", displayOrder: 3, name: "Продукты и авторский метод" },
  { id: "sales_technology", displayOrder: 4, name: "Технология продаж" },
  { id: "funnel", displayOrder: 5, name: "Воронка продаж и связки" },
  { id: "blog", displayOrder: 6, name: "Блог" },
  { id: "team", displayOrder: 7, name: "Команда" },
] as const satisfies readonly SevenKElementDefinition[];

if (SEVEN_K_ELEMENTS.length !== SEVEN_K_ELEMENT_IDS.length) {
  throw new Error("elements.v1 does not contain all canonical 7K elements");
}

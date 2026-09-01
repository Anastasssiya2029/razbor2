export type DiagnosticFormFieldDefinition = {
  sourceKey: string;
  label: string;
  targetPaths: readonly string[];
  conditional?: "time_freedom_goal";
};

/**
 * The 24 manager-facing fields from Data Dictionary v1.2.
 * `currentIncome` and `clientsCount` each populate two canonical properties;
 * those derived properties are not extra questions in the UI.
 */
export const DIAGNOSTIC_FORM_FIELDS = [
  { sourceKey: "expertName", label: "Имя эксперта", targetPaths: ["identity.expertName"] },
  { sourceKey: "niche", label: "Ниша", targetPaths: ["identity.niche"] },
  {
    sourceKey: "currentIncome",
    label: "Доход в месяц",
    targetPaths: ["current.monthlyRevenueRub", "current.monthlyRevenueContext"],
  },
  {
    sourceKey: "clientsCount",
    label: "Количество клиентов",
    targetPaths: ["current.payingClientsCount", "current.clientsCountPeriod"],
  },
  { sourceKey: "weeklyTime", label: "Время на проект в неделю", targetPaths: ["current.weeklyHours"] },
  { sourceKey: "products", label: "Какие продукты продаёте", targetPaths: ["current.products"] },
  { sourceKey: "bestSeller", label: "Что чаще покупают", targetPaths: ["current.bestSeller"] },
  { sourceKey: "freeProducts", label: "Есть ли бесплатные продукты", targetPaths: ["current.freeProducts"] },
  { sourceKey: "goalIncome", label: "Доход в месяц", targetPaths: ["target.monthlyRevenueRub"] },
  {
    sourceKey: "goalModel",
    label: "На чём хотите зарабатывать (модель)",
    targetPaths: ["target.businessModel"],
  },
  { sourceKey: "deadline", label: "Срок", targetPaths: ["target.deadlineMonths"] },
  { sourceKey: "delegate", label: "Что хотите делегировать", targetPaths: ["target.delegation"] },
  {
    sourceKey: "systemTime",
    label: "Время на проект (система есть)",
    targetPaths: ["target.desiredSystemWeeklyHours"],
    conditional: "time_freedom_goal",
  },
  { sourceKey: "clients", label: "Кто клиенты", targetPaths: ["project.clients"] },
  { sourceKey: "result", label: "Результат", targetPaths: ["project.result"] },
  { sourceKey: "sources", label: "Откуда приходят", targetPaths: ["project.sources"] },
  { sourceKey: "clientPath", label: "Путь клиента", targetPaths: ["project.clientPath"] },
  { sourceKey: "sales", label: "Продажи", targetPaths: ["project.sales"] },
  { sourceKey: "socialAssets", label: "Социальные активы", targetPaths: ["project.socialAssets"] },
  { sourceKey: "team", label: "Команда", targetPaths: ["project.team"] },
  { sourceKey: "uniqueness", label: "Уникальность", targetPaths: ["project.uniqueness"] },
  { sourceKey: "struggles", label: "Трудности", targetPaths: ["experience.struggles"] },
  { sourceKey: "bestPeriod", label: "Лучший период", targetPaths: ["experience.bestPeriod"] },
  { sourceKey: "failures", label: "Ошибки и провалы", targetPaths: ["experience.failures"] },
] as const satisfies readonly DiagnosticFormFieldDefinition[];

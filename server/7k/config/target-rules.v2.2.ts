import type { SevenKElementId, SevenKPartialScores, SevenKScores } from "../types";

export const TARGET_RULES_RESOURCE_VERSION = "target-rules.v2.2" as const;

export const BASE_MODEL_FAMILIES = [
  "single_service",
  "package_1to1",
  "premium_1to1",
  "group_live",
  "membership",
  "autoproduct",
  "retreat_event",
  "agency",
  "school_licensing",
  "product_company",
] as const;
export const MODEL_FAMILIES = [...BASE_MODEL_FAMILIES, "hybrid"] as const;

export type BaseModelFamily = (typeof BASE_MODEL_FAMILIES)[number];
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

export const BASE_MODEL_PROFILES = {
  single_service: {
    authenticity: 3,
    audience: 4,
    product_method: 2,
    sales_technology: 4,
    funnel: 3,
    blog: 0,
    team: 0,
  },
  package_1to1: {
    authenticity: 4,
    audience: 4,
    product_method: 3,
    sales_technology: 4,
    funnel: 3,
    blog: 0,
    team: 0,
  },
  premium_1to1: {
    authenticity: 6,
    audience: 6,
    product_method: 5,
    sales_technology: 7,
    funnel: 5,
    blog: 0,
    team: 0,
  },
  group_live: {
    authenticity: 6,
    audience: 6,
    product_method: 6,
    sales_technology: 6,
    funnel: 6,
    blog: 4,
    team: 3,
  },
  membership: {
    authenticity: 6,
    audience: 7,
    product_method: 7,
    sales_technology: 5,
    funnel: 7,
    blog: 6,
    team: 5,
  },
  autoproduct: {
    authenticity: 5,
    audience: 8,
    product_method: 8,
    sales_technology: 6,
    funnel: 8,
    blog: 6,
    team: 5,
  },
  retreat_event: {
    authenticity: 6,
    audience: 6,
    product_method: 5,
    sales_technology: 5,
    funnel: 5,
    blog: 4,
    team: 4,
  },
  agency: {
    authenticity: 4,
    audience: 6,
    product_method: 5,
    sales_technology: 7,
    funnel: 5,
    blog: 0,
    team: 6,
  },
  school_licensing: {
    authenticity: 7,
    audience: 8,
    product_method: 10,
    sales_technology: 8,
    funnel: 8,
    blog: 7,
    team: 9,
  },
  product_company: {
    authenticity: 5,
    audience: 8,
    product_method: 8,
    sales_technology: 6,
    funnel: 8,
    blog: 5,
    team: 6,
  },
} as const satisfies Record<BaseModelFamily, SevenKScores>;

export type CapabilityFloorDefinition = {
  elementId: SevenKElementId;
  floor: number;
  whenRequired: string;
};

export const CAPABILITY_FLOORS = {
  clear_why_me: { elementId: "authenticity", floor: 3, whenRequired: "Нужно понятно сформулировать, чем эксперт отличается." },
  code_identity: { elementId: "authenticity", floor: 4, whenRequired: "Нужно целостное понимание себя и собственной роли." },
  brand_packaging: { elementId: "authenticity", floor: 5, whenRequired: "Код личности должен быть перенесён в упаковку/самопрезентацию." },
  confident_personal_value: { elementId: "authenticity", floor: 6, whenRequired: "Нужно уверенно и убедительно доносить ценность себя как эксперта." },
  public_recognition: { elementId: "authenticity", floor: 7, whenRequired: "Личный бренд должен уверенно работать перед большой аудиторией." },
  managed_personal_brand: { elementId: "authenticity", floor: 8, whenRequired: "Нужно осознанно управлять вниманием и ассоциациями." },
  team_reproducible_brand: { elementId: "authenticity", floor: 9, whenRequired: "Бренд должна воспроизводить команда/AI." },
  scalable_brand: { elementId: "authenticity", floor: 10, whenRequired: "Бренд масштабируется на новые аудитории без потери ядра." },

  deep_avatar: { elementId: "audience", floor: 4, whenRequired: "Нужно глубоко понимать одного типичного клиента." },
  priority_segment: { elementId: "audience", floor: 5, whenRequired: "Нужен один подтверждённый приоритетный сегмент." },
  qualification_my_not_my: { elementId: "audience", floor: 6, whenRequired: "Нужно квалифицировать «своих / не своих»." },
  subsegments_by_experience: { elementId: "audience", floor: 7, whenRequired: "Нужны подтверждённые подсегменты по фактическому опыту." },
  multi_segment_economics: { elementId: "audience", floor: 8, whenRequired: "Модель работает с несколькими сегментами и их экономикой." },
  personalized_segments: { elementId: "audience", floor: 9, whenRequired: "Маркетинг/продажи различаются по сегментам." },
  team_search_qualification: { elementId: "audience", floor: 10, whenRequired: "Поиск и квалификацией ЦА управляет команда." },

  result_product: { elementId: "product_method", floor: 2, whenRequired: "Нужен продукт с понятным результатом." },
  package_tariff: { elementId: "product_method", floor: 3, whenRequired: "Нужен пакет/абонемент/тариф." },
  flagship: { elementId: "product_method", floor: 4, whenRequired: "Нужен флагманский комплексный продукт." },
  packaged_flagship: { elementId: "product_method", floor: 5, whenRequired: "Флагман должен быть полностью сформулирован и упакован." },
  author_method: { elementId: "product_method", floor: 6, whenRequired: "Нужен оформленный авторский метод." },
  product_line: { elementId: "product_method", floor: 7, whenRequired: "Нужна полноценная продуктовая линейка." },
  working_ecosystem: { elementId: "product_method", floor: 8, whenRequired: "Продукты должны реально продавать друг друга." },
  ltv_management: { elementId: "product_method", floor: 9, whenRequired: "Нужно управлять LTV и продуктовой экономикой." },
  team_reproducible_method: { elementId: "product_method", floor: 10, whenRequired: "Метод и продуктовая система воспроизводятся командой." },

  basic_sales_structure: { elementId: "sales_technology", floor: 4, whenRequired: "Нужна базовая технология встречи/переписки." },
  regular_personal_sales: { elementId: "sales_technology", floor: 5, whenRequired: "Технология должна использоваться регулярно с базовой статистикой." },
  managed_sales_crm: { elementId: "sales_technology", floor: 6, whenRequired: "Нужны CRM/учёт, причины отказов и управляемость." },
  master_personal_sales: { elementId: "sales_technology", floor: 7, whenRequired: "Нужно мастерское личное владение продажей." },
  codified_forecastable_sales: { elementId: "sales_technology", floor: 8, whenRequired: "Технология должна быть оцифрована и прогнозируема." },
  delegated_sales: { elementId: "sales_technology", floor: 9, whenRequired: "По технологии продают менеджеры." },
  managed_sales_department: { elementId: "sales_technology", floor: 10, whenRequired: "Продажами управляет команда без владельца." },

  simple_free_linkage: { elementId: "funnel", floor: 3, whenRequired: "Нужно тестировать бесплатные источники и простую связку." },
  full_marketing_path: { elementId: "funnel", floor: 4, whenRequired: "Нужен полный маркетинговый путь до продажи." },
  proven_linkage: { elementId: "funnel", floor: 5, whenRequired: "Одна связка должна быть доказана повторяемыми продажами." },
  lead_capture_funnel: { elementId: "funnel", floor: 6, whenRequired: "Нужна воронка со сбором лидов в собственную базу." },
  paid_traffic: { elementId: "funnel", floor: 7, whenRequired: "Нужен платный источник и экономика воронки." },
  multi_source_one_funnel: { elementId: "funnel", floor: 8, whenRequired: "Несколько источников должны вести в доказанную воронку." },
  multi_funnel: { elementId: "funnel", floor: 9, whenRequired: "Нужны несколько воронок/точек входа." },
  team_managed_acquisition: { elementId: "funnel", floor: 10, whenRequired: "Системой привлечения управляет команда." },

  content_for_audience: { elementId: "blog", floor: 3, whenRequired: "Нужно регулярно говорить о задачах своей ЦА." },
  content_system: { elementId: "blog", floor: 4, whenRequired: "Нужна авторская контент-система." },
  paid_audience_growth: { elementId: "blog", floor: 5, whenRequired: "Нужно системно платно наращивать целевую аудиторию." },
  product_warmup: { elementId: "blog", floor: 6, whenRequired: "Блог должен быть связан с продуктом и общей воронкой." },
  regular_sales_from_blog: { elementId: "blog", floor: 7, whenRequired: "Блог регулярно даёт обращения и продажи." },
  repeatable_content_linkages: { elementId: "blog", floor: 8, whenRequired: "Контентные связки повторяемо создают бизнес-действия." },
  delegated_multiplatform_content: { elementId: "blog", floor: 9, whenRequired: "Контент производят команда/AI на нескольких площадках." },
  media_system: { elementId: "blog", floor: 10, whenRequired: "Медиа-система создаёт спрос без ежедневного участия эксперта." },

  ai_for_owner: { elementId: "team", floor: 1, whenRequired: "Владелец использует AI для рабочих задач." },
  specialist_contractors: { elementId: "team", floor: 2, whenRequired: "Нужны подрядчики на отдельные функции." },
  regular_freelancers: { elementId: "team", floor: 3, whenRequired: "Повторяемые задачи закреплены за исполнителями." },
  assistant_ai_team: { elementId: "team", floor: 4, whenRequired: "Нужен постоянный ассистент + AI-команда владельца." },
  partial_process_delegation: { elementId: "team", floor: 5, whenRequired: "Команда расширяется и получает части процессов." },
  process_result_ownership: { elementId: "team", floor: 6, whenRequired: "Процессы переданы целиком вместе с ответственностью за результат." },
  ai_enhanced_employees: { elementId: "team", floor: 7, whenRequired: "Ключевые сотрудники используют собственных AI-помощников." },
  function_heads: { elementId: "team", floor: 8, whenRequired: "Крупные функции переданы руководителям." },
  management_layer: { elementId: "team", floor: 9, whenRequired: "Владелец управляет только через руководителей." },
  autonomous_org: { elementId: "team", floor: 10, whenRequired: "Бизнес самостоятельно работает, развивается и масштабируется." },
} as const satisfies Record<string, CapabilityFloorDefinition>;

export type CapabilityCode = keyof typeof CAPABILITY_FLOORS;

export const DELEGATION_MATURITY_LADDER = [
  { level: 1, code: "ai_for_owner", meaning: "AI помогает владельцу выполнять отдельные рабочие задачи." },
  { level: 2, code: "specialist_contractors", meaning: "Отдельные функции выполняют подрядчики." },
  { level: 3, code: "regular_freelancers", meaning: "Повторяемые задачи закреплены за регулярными исполнителями." },
  { level: 4, code: "assistant_ai_team", meaning: "Постоянный ассистент и AI поддерживают владельца." },
  { level: 5, code: "partial_process_delegation", meaning: "Команде переданы задачи и части процессов." },
  { level: 6, code: "process_result_ownership", meaning: "Команде переданы процессы целиком и ответственность за результат." },
  { level: 7, code: "ai_enhanced_employees", meaning: "Ключевые сотрудники системно используют собственных AI-помощников." },
  { level: 8, code: "function_heads", meaning: "Крупные функции переданы руководителям направлений." },
  { level: 9, code: "management_layer", meaning: "Владелец управляет бизнесом только через руководителей." },
  { level: 10, code: "autonomous_org", meaning: "Организация работает, развивается и масштабируется автономно." },
] as const;

export const NEXT_LEVEL_TARGET_POLICY = {
  version: "next-level-target-policy.v1",
  scoredHorizon: "horizon_2_next_level",
  laterHorizon: "horizon_3_later_vision",
  rules: [
    "activatedCapabilities contains only capabilities required for the realistic next business level within the stated target deadline",
    "distant wishes about autonomy, scale, or the owner's eventual role stay only in desiredRoleSummary and never become activated capabilities",
    "use the delegation maturity ladder literally; assistance, task delegation, process ownership, function heads, management layer, and autonomous organization are different levels",
    "do not skip delegation levels without explicit target evidence that the intermediate operating capability already exists",
    "when target wording mixes the next step with a distant vision, score the narrower next step and preserve the distant vision textually",
  ],
} as const;

export type TargetModifierDefinition = {
  description: string;
  floors: SevenKPartialScores;
};

export const TARGET_MODIFIER_FLOORS = {
  personally_sell_high_ticket: { description: "Хочет лично продавать дорогой продукт", floors: { authenticity: 6, sales_technology: 7 } },
  delegate_individual_sales: { description: "Хочет передать индивидуальные продажи менеджеру", floors: { sales_technology: 9, team: 5 } },
  exit_sales_management: { description: "Хочет полностью выйти из управления продажами", floors: { sales_technology: 10, team: 8 } },
  paid_traffic_primary_growth: { description: "Хочет использовать платный трафик как основной рост", floors: { funnel: 7 } },
  multiple_paid_sources_one_funnel: { description: "Хочет несколько платных источников в одну воронку", floors: { funnel: 8 } },
  multiple_funnels_products_segments: { description: "Хочет несколько воронок под разные продукты/сегменты", floors: { funnel: 9, audience: 9 } },
  autonomous_marketing_funnels: { description: "Хочет, чтобы маркетинг/воронки работали без него", floors: { funnel: 10, team: 8 } },
  systematic_blog_sales: { description: "Хочет системно продавать через блог", floors: { blog: 7 } },
  delegate_content_to_team_ai: { description: "Хочет передать производство контента команде/AI", floors: { blog: 9, authenticity: 9, team: 5 } },
  own_media: { description: "Хочет собственное медиа", floors: { blog: 10, authenticity: 9, team: 8 } },
  delegate_product_delivery: { description: "Хочет, чтобы продукт вели другие специалисты", floors: { product_method: 10, team: 6 } },
  product_line_repeat_ltv: { description: "Хочет линейку/повторные продажи/LTV", floors: { product_method: 9 } },
  multiple_segments_offers_marketing: { description: "Хочет несколько сегментов с разными офферами/маркетингом", floors: { audience: 9 } },
  team_finds_qualifies_audience: { description: "Хочет, чтобы команда сама находила и квалифицировала «своих»", floors: { audience: 10, team: 8 } },
  manage_only_through_heads: { description: "Хочет управлять только через руководителей", floors: { team: 9 } },
  autonomous_business: { description: "Хочет полностью автономный бизнес", floors: { team: 10 } },
} as const satisfies Record<string, TargetModifierDefinition>;

export type TargetModifierCode = keyof typeof TARGET_MODIFIER_FLOORS;
export type TargetDelegationCode =
  | "delegate_individual_sales"
  | "exit_sales_management"
  | "autonomous_marketing_funnels"
  | "delegate_content_to_team_ai"
  | "delegate_product_delivery"
  | "team_finds_qualifies_audience"
  | "manage_only_through_heads"
  | "autonomous_business";

export const DESIRED_OWNER_ROLES = [
  "hands_on_expert",
  "personal_premium_sales",
  "delegate_sales",
  "exit_sales_management",
  "manage_through_leaders",
  "autonomous_owner",
] as const;
export type DesiredOwnerRole = (typeof DESIRED_OWNER_ROLES)[number];

export const OWNER_ROLE_MODIFIER: Record<DesiredOwnerRole, TargetModifierCode | null> = {
  hands_on_expert: null,
  personal_premium_sales: "personally_sell_high_ticket",
  delegate_sales: "delegate_individual_sales",
  exit_sales_management: "exit_sales_management",
  manage_through_leaders: "manage_only_through_heads",
  autonomous_owner: "autonomous_business",
};

export const PERSONAL_DELIVERY_MODEL_FAMILIES = [
  "single_service",
  "package_1to1",
  "premium_1to1",
  "group_live",
  "retreat_event",
] as const satisfies readonly BaseModelFamily[];

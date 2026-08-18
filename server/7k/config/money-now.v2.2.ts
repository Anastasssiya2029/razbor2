export const MONEY_NOW_RESOURCE_VERSION = "money-now.v2.2" as const;

export const MONEY_NOW_SCENARIO_IDS = [
  "MN01", "MN02", "MN03", "MN04", "MN05", "MN06", "MN07", "MN08",
  "MN09", "MN10", "MN11", "MN12", "MN13", "MN14", "MN15", "MN16",
] as const;
export type MoneyNowScenarioId = (typeof MONEY_NOW_SCENARIO_IDS)[number];

export const MONEY_NOW_SIGNAL_CODES = [
  "has_current_clients",
  "has_logical_continuation",
  "current_result_confirmed",
  "continuation_objectively_needed",
  "has_next_product_or_additional_task",
  "next_offer_relevant",
  "has_one_off_clients",
  "work_is_repeatable",
  "has_fuller_result_path",
  "has_former_clients",
  "former_clients_relevant_now",
  "has_warm_leads",
  "refusal_reason_compatible",
  "has_satisfied_clients",
  "proven_result",
  "has_warm_network",
  "clear_relevant_offer",
  "has_current_audience",
  "clear_priority_segment",
  "clear_product_offer",
  "has_partners_or_communities",
  "partners_reach_target_audience",
  "has_best_period_with_payments",
  "historical_mechanism_reproducible",
  "has_proven_channel",
  "has_proven_event",
  "interest_exists",
  "client_path_break_confirmed",
  "audience_fit_confirmed",
  "meetings_or_offers_exist",
  "low_payment_conversion",
  "demand_proven",
  "price_objectively_underpriced",
  "value_can_be_communicated",
  "free_capacity",
  "proven_path",
  "owner_or_team_overloaded",
  "closer_assets_exhausted",
  "paid_channel_proven",
] as const;
export type MoneyNowSignalCode = (typeof MONEY_NOW_SIGNAL_CODES)[number];

export const MONEY_PROXIMITY_HIERARCHY = [
  { tier: "A", rank: 1, where: "Текущие клиенты", action: "Продление, продолжение, следующий продукт, увеличение объёма/пакета." },
  { tier: "B", rank: 2, where: "Тёплые лиды / незакрытые диалоги", action: "Follow-up, уточнённое предложение, снятие конкретного барьера." },
  { tier: "C", rank: 3, where: "Бывшие клиенты / тёплая сеть / аудитория", action: "Реактивация и точечное релевантное предложение." },
  { tier: "D", rank: 4, where: "Клиенты / партнёры / коллеги", action: "Системная рекомендация или партнёрская активация." },
  { tier: "E", rank: 5, where: "Лучший период / доказанный канал / мероприятие", action: "Повторить механизм без лишнего усложнения." },
  { tier: "F", rank: 6, where: "Текущий путь и продажи", action: "Исправить конкретную причину провала на одном переходе." },
  { tier: "G", rank: 7, where: "Чек / разовая услуга / отсутствие повторов", action: "Пакет, повышение чека при доказанной ценности, следующий продукт." },
  { tier: "H", rank: 8, where: "Новый канал / платный трафик", action: "Только если более близкие активы исчерпаны или канал уже доказан." },
] as const;
export type MoneyProximityTier = (typeof MONEY_PROXIMITY_HIERARCHY)[number]["tier"];

export type MoneyNowScenarioDefinition = {
  id: MoneyNowScenarioId;
  title: string;
  whenApplicable: string;
  moneyMechanism: string;
  primaryMetric: string;
  proximityTier: MoneyProximityTier;
  eligibilityAllOf: readonly MoneyNowSignalCode[];
  stopRuleIds: readonly string[];
  historyKey: string;
  defaultSignalSpeedRank: 1 | 2 | 3 | 4;
  defaultComplexityRank: 1 | 2 | 3 | 4;
  capacityDemand: "none" | "retains_load" | "adds_load";
};

export const MONEY_NOW_SCENARIOS = [
  { id: "MN01", title: "Продлить действующих клиентов", whenApplicable: "Есть действующие клиенты + логичное продолжение", moneyMechanism: "Предложить следующий период/этап тем, кому он реально нужен.", primaryMetric: "Продления / доп. выручка", proximityTier: "A", eligibilityAllOf: ["has_current_clients", "has_logical_continuation"], stopRuleIds: ["CONTINUATION_RESULT_OR_NEED_NOT_CONFIRMED"], historyKey: "extend_current_clients", defaultSignalSpeedRank: 4, defaultComplexityRank: 1, capacityDemand: "retains_load" },
  { id: "MN02", title: "Допродать действующим клиентам", whenApplicable: "Есть следующий продукт / дополнительная задача", moneyMechanism: "Сделать релевантный upsell/cross-sell.", primaryMetric: "Допродажи / доход с клиента", proximityTier: "A", eligibilityAllOf: ["has_current_clients", "has_next_product_or_additional_task"], stopRuleIds: ["UPSELL_RESULT_OR_RELEVANCE_NOT_CONFIRMED"], historyKey: "upsell_current_clients", defaultSignalSpeedRank: 4, defaultComplexityRank: 1, capacityDemand: "adds_load" },
  { id: "MN03", title: "Упаковать разовую услугу в пакет", whenApplicable: "Есть разовые клиенты и повторяемая работа", moneyMechanism: "Предложить пакет/абонемент вместо единичной покупки.", primaryMetric: "Пакеты / доход с клиента", proximityTier: "G", eligibilityAllOf: ["has_one_off_clients", "work_is_repeatable"], stopRuleIds: ["PACKAGE_WITHOUT_FULLER_RESULT_PATH"], historyKey: "package_one_off_service", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "adds_load" },
  { id: "MN04", title: "Реактивировать бывших клиентов", whenApplicable: "Есть бывшие клиенты, которым снова актуален результат", moneyMechanism: "Вернуться с релевантным следующим шагом.", primaryMetric: "Ответы / встречи / оплаты", proximityTier: "C", eligibilityAllOf: ["has_former_clients", "former_clients_relevant_now"], stopRuleIds: [], historyKey: "reactivate_former_clients", defaultSignalSpeedRank: 3, defaultComplexityRank: 1, capacityDemand: "adds_load" },
  { id: "MN05", title: "Вернуть тёплых лидов", whenApplicable: "Есть люди, которые интересовались, но не купили", moneyMechanism: "Вернуться к незакрытым диалогам с конкретным предложением.", primaryMetric: "Диалоги / оплаты", proximityTier: "B", eligibilityAllOf: ["has_warm_leads"], stopRuleIds: ["WARM_LEAD_REASON_INCOMPATIBLE"], historyKey: "follow_up_warm_leads", defaultSignalSpeedRank: 4, defaultComplexityRank: 1, capacityDemand: "adds_load" },
  { id: "MN06", title: "Запустить рекомендации", whenApplicable: "Есть довольные клиенты и доказанный результат", moneyMechanism: "Попросить знакомства с подходящими людьми.", primaryMetric: "Рекомендации / оплаты", proximityTier: "D", eligibilityAllOf: ["has_satisfied_clients"], stopRuleIds: ["REFERRAL_WITHOUT_PROVEN_RESULT"], historyKey: "ask_for_referrals", defaultSignalSpeedRank: 3, defaultComplexityRank: 1, capacityDemand: "adds_load" },
  { id: "MN07", title: "Активировать тёплую сеть", whenApplicable: "Есть контакты, коллеги, партнёры, профессиональная сеть", moneyMechanism: "Сделать точечное релевантное приглашение.", primaryMetric: "Диалоги / встречи / оплаты", proximityTier: "C", eligibilityAllOf: ["has_warm_network", "clear_relevant_offer"], stopRuleIds: [], historyKey: "activate_warm_network", defaultSignalSpeedRank: 4, defaultComplexityRank: 1, capacityDemand: "adds_load" },
  { id: "MN08", title: "Монетизировать текущую аудиторию", whenApplicable: "Есть аудитория, но мало прямых предложений", moneyMechanism: "Сделать одно понятное предложение одному сегменту.", primaryMetric: "Заявки / оплаты", proximityTier: "C", eligibilityAllOf: ["has_current_audience"], stopRuleIds: ["AUDIENCE_OFFER_NOT_SPECIFIC"], historyKey: "monetize_current_audience", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "adds_load" },
  { id: "MN09", title: "Активировать партнёров", whenApplicable: "Есть партнёры/сообщества с доступом к ЦА", moneyMechanism: "Запустить один партнёрский сценарий.", primaryMetric: "Партнёрские оплаты", proximityTier: "D", eligibilityAllOf: ["has_partners_or_communities", "partners_reach_target_audience"], stopRuleIds: [], historyKey: "activate_partners", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "adds_load" },
  { id: "MN10", title: "Повторить лучший период", whenApplicable: "Есть прошлый механизм с подтверждёнными оплатами", moneyMechanism: "Повторить ключевые действия лучшего периода.", primaryMetric: "Выручка по механизму", proximityTier: "E", eligibilityAllOf: ["has_best_period_with_payments"], stopRuleIds: ["HISTORICAL_MECHANISM_NOT_REPRODUCIBLE"], historyKey: "repeat_best_period", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "adds_load" },
  { id: "MN11", title: "Вернуть доказанный канал", whenApplicable: "Канал раньше давал оплаты, но остановлен", moneyMechanism: "Реактивировать канал в минимально обновлённой форме.", primaryMetric: "Оплаты / CAC, если платный", proximityTier: "E", eligibilityAllOf: ["has_proven_channel"], stopRuleIds: ["HISTORICAL_MECHANISM_NOT_REPRODUCIBLE"], historyKey: "reactivate_proven_channel", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "adds_load" },
  { id: "MN12", title: "Повторить доказанное мероприятие", whenApplicable: "Вебинар/эфир/разбор/мероприятие уже продавало", moneyMechanism: "Провести ещё один цикл.", primaryMetric: "Регистрации → оплаты", proximityTier: "E", eligibilityAllOf: ["has_proven_event"], stopRuleIds: ["HISTORICAL_MECHANISM_NOT_REPRODUCIBLE"], historyKey: "repeat_proven_event", defaultSignalSpeedRank: 2, defaultComplexityRank: 3, capacityDemand: "adds_load" },
  { id: "MN13", title: "Исправить переход к следующему шагу", whenApplicable: "Интерес есть, но люди не идут дальше", moneyMechanism: "Устранить конкретный разрыв между касаниями.", primaryMetric: "Конверсия выбранного перехода", proximityTier: "F", eligibilityAllOf: ["interest_exists", "client_path_break_confirmed"], stopRuleIds: ["CONVERSION_ROOT_CAUSE_NOT_CONFIRMED"], historyKey: "repair_client_path_step", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "adds_load" },
  { id: "MN14", title: "Пересобрать монетизацию встреч", whenApplicable: "Встречи/предложения есть, оплат мало", moneyMechanism: "Исправить доказанную причину низкой оплаты.", primaryMetric: "Встреча/предложение → оплата", proximityTier: "F", eligibilityAllOf: ["meetings_or_offers_exist", "low_payment_conversion"], stopRuleIds: ["CONVERSION_ROOT_CAUSE_NOT_CONFIRMED"], historyKey: "rebuild_meeting_monetization", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "adds_load" },
  { id: "MN15", title: "Поднять средний чек", whenApplicable: "Результат доказан, спрос есть, цена объективно занижена", moneyMechanism: "Изменить цену/пакет для новых продаж.", primaryMetric: "Средний чек / выручка", proximityTier: "G", eligibilityAllOf: ["demand_proven", "price_objectively_underpriced"], stopRuleIds: ["PRICE_INCREASE_NOT_SUPPORTED"], historyKey: "raise_average_check", defaultSignalSpeedRank: 3, defaultComplexityRank: 2, capacityDemand: "none" },
  { id: "MN16", title: "Увеличить повторения рабочей связки", whenApplicable: "Есть свободная ёмкость + доказанный путь", moneyMechanism: "Повторить уже работающую механику чаще.", primaryMetric: "Повторения / новые оплаты", proximityTier: "E", eligibilityAllOf: ["free_capacity", "proven_path"], stopRuleIds: [], historyKey: "repeat_proven_linkage", defaultSignalSpeedRank: 3, defaultComplexityRank: 1, capacityDemand: "adds_load" },
] as const satisfies readonly MoneyNowScenarioDefinition[];

export type MoneyNowStopRuleDefinition = {
  id: string;
  description: string;
  scenarioIds: readonly MoneyNowScenarioId[];
  requiredTrueSignals: readonly MoneyNowSignalCode[];
};

export const MONEY_NOW_STOP_RULES = [
  { id: "CONTINUATION_RESULT_OR_NEED_NOT_CONFIRMED", description: "Не предлагать продолжение, если текущий результат не подтверждён или клиенту оно объективно не нужно.", scenarioIds: ["MN01"], requiredTrueSignals: ["current_result_confirmed", "continuation_objectively_needed"] },
  { id: "UPSELL_RESULT_OR_RELEVANCE_NOT_CONFIRMED", description: "Не делать допродажу без подтверждённого результата и релевантной следующей задачи.", scenarioIds: ["MN02"], requiredTrueSignals: ["current_result_confirmed", "next_offer_relevant"] },
  { id: "PACKAGE_WITHOUT_FULLER_RESULT_PATH", description: "Не упаковывать разовую услугу в пакет только ради чека: должен существовать путь к более полному результату.", scenarioIds: ["MN03"], requiredTrueSignals: ["has_fuller_result_path"] },
  { id: "WARM_LEAD_REASON_INCOMPATIBLE", description: "Не делать одинаковый дожим всем отказникам; причина отказа должна быть совместима с новым предложением.", scenarioIds: ["MN05"], requiredTrueSignals: ["refusal_reason_compatible"] },
  { id: "REFERRAL_WITHOUT_PROVEN_RESULT", description: "Не просить рекомендации без доказанного результата/удовлетворённости.", scenarioIds: ["MN06"], requiredTrueSignals: ["proven_result"] },
  { id: "AUDIENCE_OFFER_NOT_SPECIFIC", description: "Не делать оффер всей аудитории без понятного сегмента и продукта.", scenarioIds: ["MN08"], requiredTrueSignals: ["clear_priority_segment", "clear_product_offer"] },
  { id: "HISTORICAL_MECHANISM_NOT_REPRODUCIBLE", description: "Исторический механизм применим только если его можно воспроизвести в текущем контексте.", scenarioIds: ["MN10", "MN11", "MN12"], requiredTrueSignals: ["historical_mechanism_reproducible"] },
  { id: "CONVERSION_ROOT_CAUSE_NOT_CONFIRMED", description: "Не чинить продажи/переход, если проблема очевидно в нецелевой аудитории или непонятном продукте.", scenarioIds: ["MN13", "MN14"], requiredTrueSignals: ["audience_fit_confirmed", "clear_product_offer"] },
  { id: "PRICE_INCREASE_NOT_SUPPORTED", description: "Поднимать чек можно только при доказанном результате, спросе и способности донести ценность.", scenarioIds: ["MN15"], requiredTrueSignals: ["proven_result", "value_can_be_communicated"] },
  { id: "NEW_PAID_TRAFFIC_WITHOUT_PROOF_OR_WARM_EXHAUSTION", description: "Новый платный трафик нельзя выбирать, если канал не доказан и более тёплые активы не исчерпаны.", scenarioIds: [], requiredTrueSignals: ["paid_channel_proven", "closer_assets_exhausted"] },
  { id: "REPEATED_SOLUTION_WITHOUT_NEW_CONDITION", description: "Не повторять прежнее решение без нового существенного условия.", scenarioIds: MONEY_NOW_SCENARIO_IDS, requiredTrueSignals: [] },
] as const satisfies readonly MoneyNowStopRuleDefinition[];

export const MONEY_NOW_CAPACITY_MODEL_FIT_RULES = [
  { id: "CAPACITY_OVERLOADED", description: "Не наращивать поток, если владелец/команда уже перегружены; сначала освободить ёмкость или изменить способ исполнения." },
  { id: "MODEL_FIT_REQUIRED", description: "Сценарий должен быть совместим с выбранной бизнес-моделью и ролью владельца." },
] as const;

export const MONEY_NOW_HISTORY_GUARD = {
  id: "REPEATED_SOLUTION_WITHOUT_NEW_CONDITION",
  rule: "Если новый intervention повторяет способ, который уже пробовали без устойчивого результата, сценарий разрешён только при новом существенном условии: аудитория, продукт, квалификация, продажа, последовательность, ёмкость или другой prerequisite.",
} as const;

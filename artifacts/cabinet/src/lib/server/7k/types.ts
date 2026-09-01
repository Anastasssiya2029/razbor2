export const SEVEN_K_ELEMENT_IDS = [
  "authenticity",
  "audience",
  "product_method",
  "sales_technology",
  "funnel",
  "blog",
  "team",
] as const;

export type SevenKElementId = (typeof SEVEN_K_ELEMENT_IDS)[number];
export type SevenKScores = Record<SevenKElementId, number>;
export type SevenKPartialScores = Partial<SevenKScores>;

export type SevenKValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export class SevenKValidationError extends Error {
  readonly issues: SevenKValidationIssue[];

  constructor(issues: SevenKValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "SevenKValidationError";
    this.issues = issues;
  }
}

export function zeroSevenKScores(): SevenKScores {
  return {
    authenticity: 0,
    audience: 0,
    product_method: 0,
    sales_technology: 0,
    funnel: 0,
    blog: 0,
    team: 0,
  };
}

export function validateSevenKScores(
  scores: SevenKScores,
  path = "/currentScores",
): SevenKScores {
  const issues: SevenKValidationIssue[] = [];
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    const value = scores?.[elementId];
    if (!Number.isInteger(value) || value < 0 || value > 10) {
      issues.push({
        path: `${path}/${elementId}`,
        code: "invalid_score",
        message: "Ожидается целое число от 0 до 10.",
      });
    }
  }
  if (issues.length > 0) throw new SevenKValidationError(issues);
  return scores;
}

export function isSevenKElementId(value: unknown): value is SevenKElementId {
  return typeof value === "string" && (SEVEN_K_ELEMENT_IDS as readonly string[]).includes(value);
}

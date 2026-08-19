import { P04_SYSTEM_PROMPT } from "@/server/7k/prompts/p04.v1.2";
import type { P04PreparedInput } from "./stage-types";

export function buildP04SystemPrompt(
  input: P04PreparedInput,
  correction: string | null = null,
): string {
  const prompt = P04_SYSTEM_PROMPT
    .replace("{{P04_CONTEXT_JSON}}", JSON.stringify(input.context))
    .replace("{{REPORT_POLICY_JSON}}", JSON.stringify(input.reportPolicy))
    .replace("{{SOURCE_REGISTRY_JSON}}", JSON.stringify(input.sourceRegistry))
    .replace("{{REPORT_GLOSSARY_JSON}}", JSON.stringify(input.reportGlossary));
  if (!correction) return prompt;
  return `${prompt}\n\n<CORRECTION_REQUIRED>\n${correction}\n</CORRECTION_REQUIRED>`;
}

/**
 * Accepts provider JSON in either of the two non-ambiguous forms used by our
 * structured-output models: a bare JSON value or one complete Markdown JSON
 * fence. It intentionally does not extract JSON from prose or multiple blocks.
 */
export function parseProviderJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (initialError) {
    const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/iu.exec(text.trim());
    if (!fenced) throw initialError;
    return JSON.parse(fenced[1].trim());
  }
}

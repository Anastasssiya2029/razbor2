function declineGivenNamePart(part: string): string {
  const lower = part.toLocaleLowerCase("ru-RU");
  const previous = lower.at(-2) ?? "";

  if (lower.endsWith("ия") || lower.endsWith("ья")) return `${part.slice(0, -1)}и`;
  if (lower.endsWith("я")) return `${part.slice(0, -1)}и`;
  if (lower.endsWith("а")) {
    return `${part.slice(0, -1)}${"гкхжчшщ".includes(previous) ? "и" : "ы"}`;
  }
  if (lower.endsWith("й")) return `${part.slice(0, -1)}я`;
  if (lower.endsWith("ь")) return `${part.slice(0, -1)}и`;
  if ("бвгджзклмнпрстфхцчшщ".includes(lower.at(-1) ?? "")) return `${part}а`;
  return part;
}

function declineFamilyNamePart(part: string): string {
  if (/ова$/iu.test(part)) return `${part.slice(0, -3)}овой`;
  if (/ева$/iu.test(part)) return `${part.slice(0, -3)}евой`;
  if (/ёва$/iu.test(part)) return `${part.slice(0, -3)}ёвой`;
  if (/ина$/iu.test(part)) return `${part.slice(0, -3)}иной`;
  return declineGivenNamePart(part);
}

function declineHyphenated(part: string, familyName: boolean): string {
  return part
    .split("-")
    .map((piece) => familyName ? declineFamilyNamePart(piece) : declineGivenNamePart(piece))
    .join("-");
}

/**
 * Conservative Russian genitive used only in the heading "для …".
 * The first token is treated as the given name; following tokens may be a
 * patronymic or family name. Unknown and indeclinable endings stay unchanged.
 */
export function declineRussianNameGenitive(name: string): string {
  const clean = name.trim().replace(/\s+/gu, " ");
  if (!clean) return "клиента";
  return clean
    .split(" ")
    .map((part, index) => declineHyphenated(part, index > 0))
    .join(" ");
}

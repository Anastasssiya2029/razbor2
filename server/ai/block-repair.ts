import { sha256 } from "@/server/stage4/hash";

export type BlockRepairEnvelope = {
  baseHash: string;
  replacements: Record<string, unknown>;
};

export class BlockRepairError extends Error {
  constructor(
    readonly code:
      | "BLOCK_REPAIR_STALE_BASE"
      | "BLOCK_REPAIR_EMPTY"
      | "BLOCK_REPAIR_FORBIDDEN_BLOCK"
      | "BLOCK_REPAIR_VALIDATION_FAILED",
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = "BlockRepairError";
  }
}

/**
 * Applies only allow-listed top-level block replacements to an immutable base.
 * This deliberately does not support arbitrary JSON Patch paths: every merged
 * candidate must pass the stage's complete schema and semantic validation.
 */
export async function applyValidatedBlockRepair<T extends Record<string, unknown>>(options: {
  base: T;
  envelope: BlockRepairEnvelope;
  allowedBlocks: readonly (keyof T & string)[];
  validate: (candidate: unknown) => T;
}): Promise<T> {
  const actualBaseHash = await sha256(options.base);
  if (options.envelope.baseHash !== actualBaseHash) {
    throw new BlockRepairError(
      "BLOCK_REPAIR_STALE_BASE",
      "Repair belongs to another base snapshot.",
    );
  }

  const replacementKeys = Object.keys(options.envelope.replacements);
  if (replacementKeys.length === 0) {
    throw new BlockRepairError("BLOCK_REPAIR_EMPTY", "Repair does not replace any block.");
  }
  const allowed = new Set<string>(options.allowedBlocks);
  const forbidden = replacementKeys.find((key) => !allowed.has(key));
  if (forbidden) {
    throw new BlockRepairError(
      "BLOCK_REPAIR_FORBIDDEN_BLOCK",
      `Repair cannot replace block: ${forbidden}.`,
    );
  }

  const candidate = structuredClone(options.base) as Record<string, unknown>;
  for (const key of replacementKeys) {
    candidate[key] = structuredClone(options.envelope.replacements[key]);
  }
  try {
    return options.validate(candidate);
  } catch (error) {
    throw new BlockRepairError(
      "BLOCK_REPAIR_VALIDATION_FAILED",
      "Repaired candidate failed full stage validation.",
      { cause: error },
    );
  }
}

export function selectTopLevelRepairBlocks(
  issuePaths: readonly string[],
  allowedBlocks: readonly string[],
  maximumBlocks = 3,
): string[] {
  const allowed = new Set(allowedBlocks);
  const selected: string[] = [];
  for (const path of issuePaths) {
    const match = path.match(/^\/([^/]+)/u);
    const block = match?.[1];
    if (!block || !allowed.has(block) || selected.includes(block)) continue;
    selected.push(block);
    if (selected.length > maximumBlocks) return [];
  }
  return selected;
}

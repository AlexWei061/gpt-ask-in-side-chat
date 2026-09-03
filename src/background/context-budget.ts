import { ExtensionError } from "../shared/errors";

export function estimateTokens(value: string): number {
  let tokens = 0;
  for (const character of value) tokens += character.codePointAt(0)! > 0x7f ? 1 : 0.25;
  return Math.ceil(tokens);
}

export function assertWithinBudget(approximateTokens: number, contextWindowTokens: number): void {
  const budget = Math.floor(contextWindowTokens * 0.9);
  if (approximateTokens > budget) {
    throw new ExtensionError(
      "CONTEXT_OVERFLOW",
      `The request is approximately ${approximateTokens} tokens, exceeding the ${budget}-token context budget.`,
    );
  }
}

export function partitionForCompression(values: string[], tokenBudget: number): string[][] {
  const partitions: string[][] = [];
  let partition: string[] = [];
  let partitionTokens = 0;

  for (const value of values) {
    const tokens = estimateTokens(value);
    if (partition.length > 0 && partitionTokens + tokens > tokenBudget) {
      partitions.push(partition);
      partition = [];
      partitionTokens = 0;
    }
    partition.push(value);
    partitionTokens += tokens;
  }
  if (partition.length > 0) partitions.push(partition);
  return partitions;
}

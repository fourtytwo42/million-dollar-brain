const insufficientAllowanceSelector = "0xfb8f41b2";

function errorText(error: unknown, depth = 0): string {
  if (depth > 4 || error === null || error === undefined) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const nested = "cause" in error ? errorText(error.cause, depth + 1) : "";
    return `${error.name} ${error.message} ${nested}`;
  }
  if (typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [
      value.name,
      value.message,
      value.shortMessage,
      value.details,
      errorText(value.cause, depth + 1),
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
  }
  return String(error);
}

export function isAllowancePropagationError(error: unknown) {
  const message = errorText(error).toLowerCase();
  return (
    message.includes(insufficientAllowanceSelector) ||
    message.includes("erc20insufficientallowance")
  );
}

export async function retryApprovalDependentWrite<T>(
  write: () => Promise<T>,
  options: {
    attempts?: number;
    delayMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
) {
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 2_000;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      if (
        !isAllowancePropagationError(error) ||
        attempt >= Math.max(1, attempts) - 1
      ) {
        throw error;
      }
      await sleep(delayMs);
    }
  }
}

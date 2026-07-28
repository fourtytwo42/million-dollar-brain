declare global {
  var __mdbAdminTransactionTail: Promise<void> | undefined;
}

export async function withAdminTransactionLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const prior = globalThis.__mdbAdminTransactionTail ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.__mdbAdminTransactionTail = prior
    .catch(() => undefined)
    .then(() => current);
  await prior.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

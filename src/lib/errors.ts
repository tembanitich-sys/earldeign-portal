/** An error whose message is safe and useful to show to the user. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(message);
}

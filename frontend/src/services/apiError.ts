/** A normalized, human-readable API error thrown by the services layer. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Convert unknown fetch/network failures into a friendly message. */
export function toFriendlyError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) {
    // fetch throws a TypeError on network failure / CORS / server unreachable
    return 'Could not reach the server. Please check your connection and try again.';
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Cancelled.';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

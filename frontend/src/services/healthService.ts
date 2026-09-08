import { API_BASE_URL } from './config';
import { ApiError } from './apiError';
import type { HealthResponse } from '../types';

/** Ping the backend health endpoint. Throws ApiError on non-OK responses. */
export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`, { signal });
  if (!res.ok) {
    throw new ApiError(`Backend health check failed (${res.status})`, res.status);
  }
  return (await res.json()) as HealthResponse;
}

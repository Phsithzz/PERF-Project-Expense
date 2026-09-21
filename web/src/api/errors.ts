import axios from "axios";

import type { ApiErrorBody, ApiFieldError } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly details: ApiFieldError[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data?.error;
    if (body) {
      return new ApiError(
        body.message,
        body.code,
        error.response?.status,
        body.details ?? [],
        body.requestId,
      );
    }

    if (error.code === "ERR_NETWORK") {
      return new ApiError(
        "Cannot reach the API. Check your connection and try again.",
        "NETWORK",
      );
    }
  }

  return new ApiError("Something went wrong. Please try again.", "UNKNOWN");
}

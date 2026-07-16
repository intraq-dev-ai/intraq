export interface ApiSuccess<TData> {
  success: true;
  data: TData;
}

export interface ApiFailure {
  success: false;
  error: string;
  details?: Record<string, string>;
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export function ok<TData>(data: TData): ApiSuccess<TData> {
  return {
    success: true,
    data
  };
}

export function fail(error: string, details?: Record<string, string>): ApiFailure {
  return details
    ? { success: false, error, details }
    : { success: false, error };
}

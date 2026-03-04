export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    total?: number;
    limit: number;
    lastKey?: string;
    hasMore: boolean;
  };
}

export interface AuthContext {
  userId: string;
  email: string;
  roles: string[];
}

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
  /**
   * Tenant the user belongs to (Cognito `custom:warrantyCompanyId`), for
   * company-facing users. Absent for consumers/repairers and for admin/Xpert
   * (who see across all tenants). Used by the central tenant-scope helper.
   */
  warrantyCompanyId?: string;
}

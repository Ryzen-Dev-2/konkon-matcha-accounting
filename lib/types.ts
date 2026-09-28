export const USER_ROLES = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "CASHIER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  sessionVersion?: number;
  mustChangePassword?: boolean;
};

export type SessionPayload = SessionUser & {
  sessionId: string;
  contextHash: string;
  exp?: number;
  iat?: number;
};

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: string; issues?: Record<string, string[]> };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type ProductRecord = {
  _id: string;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  globalStock?: number;
  locationTracked?: boolean;
  batchTracked?: boolean;
  expiryWarningDays?: number;
  stockLocationId?: string;
  locationBalances?: Array<{ productId: string; sku: string; productName: string; locationId: string; locationCode: string; locationName: string; quantity: number }>;
  reorderLevel: number;
  onlineEnabled?: boolean;
  onlineDescription?: string;
  onlineImage?: string;
  sensitiveGood?: boolean;
  dimensionDefaults?: {
    costCentre?: { id: string; code: string; name: string };
    project?: { id: string; code: string; name: string };
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MemberRecord = {
  _id: string;
  memberNo: string;
  memberCardCode: string;
  name: string;
  phone: string;
  email: string;
  points: number;
  lifetimeSpend: number;
  active: boolean;
  identityType?: string;
  identityLast4?: string;
  createdAt: string;
};

export type JournalLine = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

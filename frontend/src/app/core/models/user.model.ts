export type UserRole = "admin" | "cashier";

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  subText: string;
  initials: string;
  isActive: boolean;
  pin?: string;
  autoLockMinutes?: number;
}

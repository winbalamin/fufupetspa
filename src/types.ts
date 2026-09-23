export type PetType = "Dog" | "Cat" | "Rabbit" | "Other";
export type BookingStatus = "Waiting" | "In-Progress";

export interface Booking {
  id: number;
  petName: string;
  petType: PetType;
  phone: string;
  date: string;
  timeRange: string;
  staffId: number | null;
  status: BookingStatus;
  createdBy: string | null;
  size: string | null;
  qty: number | null;
  serviceType: string | null;
}

export interface Staff {
  id: number;
  name: string;
  role: string;
  busyWith: string | null;
  username: string;
}

export type UserRole = "admin" | "staff";

export interface AuthSession {
  role: UserRole;
  name: string;
  username: string;
  staffId?: number;
}

export interface SessionHistory {
  id: number;
  petName: string;
  petType: PetType;
  phone: string;
  date: string;
  timeRange: string;
  staffId: number | null;
  staffName: string | null;
  checkedInAt: string;
  checkedOutAt: string;
  amount: number;
}

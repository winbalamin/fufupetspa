import type { AuthSession, Booking, PetType, SessionHistory, Staff } from "@/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data as T;
}

export function login(input: { username: string; password: string }) {
  return request<AuthSession>("/api/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchStaff() {
  return request<Staff[]>("/api/staff");
}

export function createStaff(input: { name: string; role: string; username: string; password: string }) {
  return request<Staff>("/api/staff", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateStaff(
  id: number,
  input: { name: string; role: string; username: string; password?: string },
) {
  return request<Staff>(`/api/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteStaff(id: number) {
  return request<{ ok: true }>(`/api/staff/${id}`, {
    method: "DELETE",
  });
}

export function fetchBookings(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<Booking[]>(`/api/bookings${query}`);
}

export function fetchWeekBookings(startDate: string, endDate: string) {
  return request<Booking[]>(`/api/bookings?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
}

export function createBooking(input: {
  petName: string;
  petType: PetType;
  phone: string;
  date: string;
  timeRange: string;
}) {
  return request<Booking>("/api/bookings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBooking(
  id: number,
  input: { petName: string; petType: PetType; phone: string; date: string; timeRange: string },
) {
  return request<Booking>(`/api/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function checkInBooking(bookingId: number, staffId: number) {
  return request<Booking>(`/api/bookings/${bookingId}/checkin`, {
    method: "PATCH",
    body: JSON.stringify({ staffId }),
  });
}

export function checkoutBooking(bookingId: number, amount: number) {
  return request<{ ok: true; amount: number }>(`/api/bookings/${bookingId}/checkout`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export function fetchHistory(params?: { date?: string; month?: number; year?: number; staffId?: number }) {
  const search = new URLSearchParams();
  if (params?.date) search.set("date", params.date);
  if (params?.month !== undefined) search.set("month", String(params.month));
  if (params?.year !== undefined) search.set("year", String(params.year));
  if (params?.staffId !== undefined) search.set("staffId", String(params.staffId));
  const query = search.toString();
  return request<SessionHistory[]>(`/api/history${query ? `?${query}` : ""}`);
}

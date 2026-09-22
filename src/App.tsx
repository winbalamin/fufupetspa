import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "@/api/client";
import type { AuthSession, Booking, BookingStatus, PetType, SessionHistory, Staff } from "@/types";

type Screen = "dashboard" | "add-booking" | "edit-booking" | "manage-staff" | "history";
type Modal = null | "checkin" | "checkout";

const AUTH_STORAGE_KEY = "fufu-auth";

function loadAuthSession(): AuthSession | null {
  const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (parsed.role === "admin" || parsed.role === "staff") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function saveAuthSession(session: AuthSession) {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearAuthSession() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

// ─── Initial Data ─────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekDates(weekOffset = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDayHeader(iso: string) {
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const today = todayISO();
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return iso === today ? `${weekday}, ${day} — Today` : `${weekday}, ${day}`;
}

function formatWeekRange(dates: string[]) {
  if (dates.length === 0) return "";
  const start = formatDisplayDate(dates[0]);
  const end = formatDisplayDate(dates[dates.length - 1]);
  return `${start} – ${end}`;
}

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime12h(time24: string) {
  const [hourPart, minutePart = "00"] = time24.split(":");
  const hour = Number(hourPart);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutePart.padStart(2, "0")} ${period}`;
}

function formatTimeRange(startTime: string, endTime: string) {
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
}

function timeToMinutes(time24: string) {
  const [hours, minutes] = time24.split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidTimeInterval(startTime: string, endTime: string) {
  return timeToMinutes(endTime) > timeToMinutes(startTime);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSessionDuration(checkedInAt: string, checkedOutAt: string) {
  const minutes = Math.max(0, Math.round((Date.parse(checkedOutAt) - Date.parse(checkedInAt)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PawIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <ellipse cx="6" cy="7" rx="2" ry="3" opacity="0.85" />
      <ellipse cx="10.5" cy="5" rx="1.8" ry="2.8" opacity="0.85" />
      <ellipse cx="14.5" cy="5.5" rx="1.7" ry="2.6" opacity="0.85" />
      <ellipse cx="18.5" cy="7.5" rx="1.7" ry="2.6" opacity="0.85" />
      <path d="M12 10c-3.5 0-7 2.5-7 5.5 0 1.5.5 2.5 1.5 3s2 .5 3 0l2.5-1 2.5 1c1 .5 2 .5 3 0s1.5-1.5 1.5-3C19 12.5 15.5 10 12 10z" />
    </svg>
  );
}

function DogIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className}>
      <path d="M8 4 C6 4 4 6 4 8 L4 10 C2 10 2 12 3 13 L5 13 C5 15 6 16 8 16 L8 18 C8 22 10 24 16 24 C22 24 24 22 24 18 L24 16 L26 14 C28 12 28 10 26 8 L24 8 L24 6 C24 4 22 3 20 4 L18 5 C17 4.5 16 4 16 4 C14 4 12 5 11 6 C10 5 9 4 8 4Z"/>
      <circle cx="11" cy="11" r="1.5" fill="white"/>
      <circle cx="21" cy="11" r="1.5" fill="white"/>
      <path d="M14 17 C14 18.5 18 18.5 18 17" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function CatIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className}>
      <path d="M8 5 L4 2 L5 10 C3 12 3 14 4 16 C3 18 4 22 6 23 L6 25 C6 26 7 27 8 27 L10 27 L10 25 C12 26 14 26 16 26 C18 26 20 26 22 25 L22 27 L24 27 C25 27 26 26 26 25 L26 23 C28 22 29 18 28 16 C29 14 29 12 27 10 L28 2 L24 5 C22 3 19 2 16 2 C13 2 10 3 8 5Z"/>
      <circle cx="12" cy="13" r="2" fill="white"/>
      <circle cx="20" cy="13" r="2" fill="white"/>
      <path d="M14 19 C14 20.5 18 20.5 18 19" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function RabbitIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className}>
      <ellipse cx="10" cy="7" rx="3" ry="6"/>
      <ellipse cx="22" cy="7" rx="3" ry="6"/>
      <ellipse cx="16" cy="18" rx="8" ry="9"/>
      <circle cx="13" cy="16" r="1.5" fill="white"/>
      <circle cx="19" cy="16" r="1.5" fill="white"/>
      <ellipse cx="16" cy="20" rx="2" ry="1" fill="#F9A8B8" opacity="0.8"/>
    </svg>
  );
}

function OtherPetIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className}>
      <circle cx="16" cy="16" r="12"/>
      <circle cx="12" cy="13" r="2" fill="white"/>
      <circle cx="20" cy="13" r="2" fill="white"/>
      <path d="M12 21 C12 23 20 23 20 21" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function CalendarIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="3"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function UserIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function CheckIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function ArrowLeftIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PetIcon({ type, size = 20, className = "" }: { type: PetType; size?: number; className?: string }) {
  switch (type) {
    case "Dog": return <DogIcon size={size} className={className} />;
    case "Cat": return <CatIcon size={size} className={className} />;
    case "Rabbit": return <RabbitIcon size={size} className={className} />;
    default: return <OtherPetIcon size={size} className={className} />;
  }
}

function petColor(type: PetType) {
  switch (type) {
    case "Dog": return "#B8956A";
    case "Cat": return "#A07EC8";
    case "Rabbit": return "#E07E9A";
    default: return "#7FB3E0";
  }
}

function PetAvatar({ type, size = 40 }: { type: PetType; size?: number }) {
  const bg = petColor(type);
  return (
    <div
      style={{ width: size, height: size, backgroundColor: bg, flexShrink: 0 }}
      className="rounded-full flex items-center justify-center text-white"
    >
      <PetIcon type={type} size={size * 0.55} />
    </div>
  );
}

const STAFF_AVATAR_COLORS = ["#7FC8A9", "#F6C453", "#7FB3E0", "#A07EC8", "#E07E9A", "#B8956A"];

function staffInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function StaffAvatar({ staff, size = 48 }: { staff: Pick<Staff, "id" | "name">; size?: number }) {
  const color = STAFF_AVATAR_COLORS[(staff.id - 1) % STAFF_AVATAR_COLORS.length];
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color, flexShrink: 0 }}
      className="rounded-full flex items-center justify-center text-white font-bold text-sm"
    >
      {staffInitials(staff.name)}
    </div>
  );
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function LockIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;

    void (async () => {
      setSubmitting(true);
      setError(null);
      try {
        const session = await api.login({
          username: username.trim(),
          password,
        });
        saveAuthSession(session);
        onLogin(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid username or password");
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <div className="min-h-full">
      <header style={{ backgroundColor: "#fff", borderBottom: "1px solid #E8E3DA" }} className="sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-2">
          <div style={{ flexShrink: 0 }} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden">
            <img src="/logo.jpg" alt="FuFu PetSpa" className="w-full h-full object-cover" />
          </div>
          <span style={{ color: "#3D4A43" }} className="font-extrabold text-base sm:text-xl tracking-tight">FuFu PetSpa Manager</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl shadow-sm p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div style={{ backgroundColor: "#7FC8A9" }} className="w-10 h-10 rounded-xl flex items-center justify-center text-white">
              <LockIcon size={20} />
            </div>
            <h1 style={{ color: "#3D4A43" }} className="text-xl sm:text-2xl font-extrabold tracking-tight">Sign In</h1>
          </div>
          <p style={{ color: "#6B7A72" }} className="text-sm font-semibold mb-8">Admin or staff — use your username and password</p>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="login-username" style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                placeholder="e.g. admin or staff1"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="login-password" style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
              />
            </div>

            {error && (
              <p style={{ color: "#B91C1C", backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }} className="mb-4 rounded-xl px-4 py-3 text-sm font-semibold">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!username.trim() || !password || submitting}
              style={{ backgroundColor: username.trim() && password && !submitting ? "#7FC8A9" : "#C8E8DA", color: "#fff" }}
              className="w-full py-3.5 rounded-full font-extrabold text-sm shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p style={{ color: "#B0B8B3" }} className="text-xs font-semibold mt-6 text-center">
            Admin: admin / password · Staff: staff1, staff2, staff3 / password
          </p>
        </div>
      </main>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: BookingStatus }) {
  return status === "Waiting" ? (
    <span style={{ backgroundColor: "#FEF6E0", color: "#C49430", border: "1.5px solid #F6C453" }} className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">Waiting</span>
  ) : (
    <span style={{ backgroundColor: "#E8F2FB", color: "#3B7EC0", border: "1.5px solid #7FB3E0" }} className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">In-Progress</span>
  );
}

function Dashboard({
  bookings,
  weekBookings,
  weekDates,
  weekOffset,
  staff,
  session,
  isAdmin,
  onAddBooking,
  onManageStaff,
  onViewHistory,
  onCheckin,
  onCheckout,
  onEditBooking,
  onChangeWeek,
  onLogout,
}: {
  bookings: Booking[];
  weekBookings: Booking[];
  weekDates: string[];
  weekOffset: number;
  staff: Staff[];
  session: AuthSession;
  isAdmin: boolean;
  onAddBooking: () => void;
  onManageStaff: () => void;
  onViewHistory: () => void;
  onCheckin: (b: Booking) => void;
  onCheckout: (b: Booking) => void;
  onEditBooking: (b: Booking) => void;
  onChangeWeek: (offset: number) => void;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-full">
      {/* Top Bar */}
      <header style={{ backgroundColor: "#fff", borderBottom: "1px solid #E8E3DA" }} className="sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div style={{ flexShrink: 0 }} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden">
              <img src="/logo.jpg" alt="FuFu PetSpa" className="w-full h-full object-cover" />
            </div>
            <span style={{ color: "#3D4A43" }} className="font-extrabold text-base sm:text-xl tracking-tight truncate">FuFu PetSpa Manager</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex flex-col items-end" style={{ color: "#6B7A72" }}>
              <span className="text-xs font-semibold">{session.name}</span>
              <span className="text-[11px] font-semibold opacity-80">@{session.username}</span>
            </div>
            <div className="hidden md:flex items-center gap-2" style={{ color: "#6B7A72" }}>
              <CalendarIcon size={15} />
              <span className="text-sm font-semibold">{formatDate()}</span>
            </div>
            <div className="flex md:hidden items-center gap-1.5" style={{ color: "#6B7A72" }}>
              <CalendarIcon size={14} />
              <span className="text-xs font-semibold">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
            <button
              onClick={onLogout}
              style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
              className="text-xs font-bold px-3 py-1.5 rounded-full hover:border-[#3D4A43] hover:text-[#3D4A43] transition-colors whitespace-nowrap"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        {/* Page title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
          <div>
            <h1 style={{ color: "#3D4A43" }} className="text-2xl sm:text-3xl font-extrabold tracking-tight">Today's Dashboard</h1>
            <p style={{ color: "#6B7A72" }} className="text-xs sm:text-sm mt-0.5 font-semibold">Manage grooming sessions and staff</p>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            {isAdmin && (
              <button
                onClick={onViewHistory}
                style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-bold text-sm hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-all whitespace-nowrap"
              >
                View History
              </button>
            )}
            <button
              onClick={onAddBooking}
              style={{ backgroundColor: "#F6C453", color: "#3D4A43" }}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-bold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
            >
              <span className="text-base leading-none">+</span> Add New Booking
            </button>
          </div>
        </div>

        {/* Staff Status */}
        <section className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
            <h2 style={{ color: "#6B7A72", letterSpacing: "0.1em" }} className="text-xs font-extrabold uppercase">Staff Status</h2>
            {isAdmin && (
              <button
                onClick={onManageStaff}
                style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                className="text-xs font-bold px-3 py-1.5 rounded-full hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-colors whitespace-nowrap"
              >
                Manage Staff
              </button>
            )}
          </div>
          {/* Mobile: horizontal scroll row; sm+: 3-col grid */}
          <div className="flex gap-3 sm:grid sm:grid-cols-3 sm:gap-4 overflow-x-auto pb-1 sm:pb-0 snap-x snap-mandatory">
            {staff.map((s) => (
              <div
                key={s.id}
                style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA", minWidth: "160px" }}
                className="rounded-2xl p-4 sm:p-5 flex flex-col items-center gap-2 sm:gap-3 shadow-sm snap-start shrink-0 sm:shrink sm:min-w-0"
              >
                <StaffAvatar staff={s} size={48} />
                <div className="text-center">
                  <div style={{ color: "#3D4A43" }} className="font-extrabold text-sm sm:text-base">{s.name}</div>
                  <div style={{ color: "#6B7A72" }} className="text-xs font-semibold mt-0.5">{s.role}</div>
                </div>
                {s.busyWith ? (
                  <span style={{ backgroundColor: "#FEF6E0", color: "#C49430", border: "1.5px solid #F6C453" }} className="text-xs font-bold px-2.5 py-1 rounded-full text-center">
                    Busy · {s.busyWith}
                  </span>
                ) : (
                  <span style={{ backgroundColor: "#E8F7F1", color: "#4B9A74", border: "1.5px solid #7FC8A9" }} className="text-xs font-bold px-2.5 py-1 rounded-full">
                    Available
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Queue */}
        <section>
          <h2 style={{ color: "#6B7A72", letterSpacing: "0.1em" }} className="text-xs font-extrabold uppercase mb-3 sm:mb-4">Today's Queue</h2>

          {/* ── Mobile card list (hidden on sm+) ── */}
          <div className="flex flex-col gap-3 sm:hidden">
            {bookings.length === 0 && (
              <div className="py-10 text-center" style={{ color: "#B0B8B3" }}>
                <PawIcon size={28} className="mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-sm">No bookings today</p>
              </div>
            )}
            {bookings.map((b) => {
              const assignedStaff = staff.find((s) => s.id === b.staffId);
              return (
                <div key={b.id} style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl p-4 shadow-sm">
                  {/* Top row: avatar + name + status */}
                  <div className="flex items-center gap-3 mb-3">
                    <PetAvatar type={b.petType} size={40} />
                    <div className="flex-1 min-w-0">
                      <div style={{ color: "#3D4A43" }} className="font-extrabold text-base truncate">{b.petName}</div>
                      <div style={{ color: "#6B7A72" }} className="text-xs font-semibold">{b.petType}</div>
                    </div>
                    <StatusPill status={b.status} />
                  </div>
                  {/* Details */}
                  <div style={{ borderTop: "1px solid #F0EDE6" }} className="pt-3 flex flex-col gap-1.5 mb-3">
                    <div className="flex items-center gap-2">
                      <CalendarIcon size={13} className="text-[#6B7A72] shrink-0" />
                      <span style={{ color: "#3D4A43" }} className="text-xs font-semibold">{formatDisplayDate(b.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#6B7A72" }} className="text-xs">🕐</span>
                      <span style={{ color: "#3D4A43" }} className="text-xs font-semibold">{b.timeRange}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserIcon size={13} className="text-[#6B7A72] shrink-0" />
                      <span style={{ color: assignedStaff ? "#3D4A43" : "#B0B8B3" }} className="text-xs font-semibold">
                        {assignedStaff ? assignedStaff.name : "Not assigned"}
                      </span>
                    </div>
                  </div>
                  {/* Action */}
                  {b.status === "Waiting" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onCheckin(b)}
                        style={{ backgroundColor: "#7FC8A9", color: "#fff" }}
                        className="flex-1 py-2.5 rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-sm"
                      >
                        Check-in
                      </button>
                      <button
                        onClick={() => onEditBooking(b)}
                        style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                        className="py-2.5 px-4 rounded-full font-bold text-sm hover:border-[#F6C453] hover:text-[#3D4A43] transition-all whitespace-nowrap"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onCheckout(b)}
                      style={{ backgroundColor: "#F6C453", color: "#3D4A43" }}
                      className="w-full py-2.5 rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-sm"
                    >
                      Checkout
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (hidden on mobile) ── */}
          <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="hidden sm:block rounded-2xl shadow-sm overflow-hidden">
            <div style={{ borderBottom: "1px solid #E8E3DA", backgroundColor: "#FAFAF8" }} className="grid grid-cols-[2fr_1fr_2.5fr_1.5fr_1.2fr_1.8fr] px-6 py-3 gap-4">
              {["Pet Name", "Type", "Date & Time", "Assigned Staff", "Status", "Action"].map((h) => (
                <div key={h} style={{ color: "#6B7A72", letterSpacing: "0.07em" }} className="text-xs font-extrabold uppercase">{h}</div>
              ))}
            </div>
            {bookings.map((b, i) => {
              const assignedStaff = staff.find((s) => s.id === b.staffId);
              return (
                <div
                  key={b.id}
                  style={{ borderBottom: i < bookings.length - 1 ? "1px solid #F0EDE6" : "none" }}
                  className="grid grid-cols-[2fr_1fr_2.5fr_1.5fr_1.2fr_1.8fr] px-6 py-4 gap-4 items-center hover:bg-[#FAFAF8] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PetAvatar type={b.petType} size={36} />
                    <span style={{ color: "#3D4A43" }} className="font-bold text-sm">{b.petName}</span>
                  </div>
                  <span style={{ color: "#6B7A72" }} className="text-sm font-semibold">{b.petType}</span>
                  <div>
                    <div style={{ color: "#3D4A43" }} className="text-sm font-semibold">{formatDisplayDate(b.date)}</div>
                    <div style={{ color: "#6B7A72" }} className="text-xs font-semibold mt-0.5">{b.timeRange}</div>
                  </div>
                  <span style={{ color: assignedStaff ? "#3D4A43" : "#B0B8B3" }} className="text-sm font-semibold">
                    {assignedStaff ? assignedStaff.name : "—"}
                  </span>
                  <div><StatusPill status={b.status} /></div>
                  <div className="flex items-center gap-2">
                    {b.status === "Waiting" ? (
                      <>
                        <button onClick={() => onCheckin(b)} style={{ backgroundColor: "#7FC8A9", color: "#fff" }} className="text-xs font-bold px-3 py-1.5 rounded-full hover:opacity-90 active:scale-95 transition-all whitespace-nowrap shadow-sm">Check-in</button>
                        <button onClick={() => onEditBooking(b)} style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }} className="text-xs font-bold px-3 py-1.5 rounded-full hover:border-[#F6C453] hover:text-[#3D4A43] transition-all whitespace-nowrap">Edit</button>
                      </>
                    ) : (
                      <button onClick={() => onCheckout(b)} style={{ backgroundColor: "#F6C453", color: "#3D4A43" }} className="text-xs font-bold px-3 py-1.5 rounded-full hover:opacity-90 active:scale-95 transition-all whitespace-nowrap shadow-sm">Checkout</button>
                    )}
                  </div>
                </div>
              );
            })}
            {bookings.length === 0 && (
              <div className="px-6 py-12 text-center" style={{ color: "#B0B8B3" }}>
                <PawIcon size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-sm">No bookings today</p>
              </div>
            )}
          </div>
        </section>

        {/* Weekly Calendar */}
        <section className="mt-6 sm:mt-8">
          <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
            <h2 style={{ color: "#6B7A72", letterSpacing: "0.1em" }} className="text-xs font-extrabold uppercase">This Week</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChangeWeek(weekOffset - 1)}
                style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-colors"
              >
                ‹
              </button>
              <span style={{ color: "#3D4A43" }} className="text-sm font-bold min-w-[180px] text-center">
                {formatWeekRange(weekDates)}
              </span>
              <button
                onClick={() => onChangeWeek(weekOffset + 1)}
                style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-colors"
              >
                ›
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => onChangeWeek(0)}
                  style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                  className="text-xs font-bold px-3 py-1.5 rounded-full hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-colors whitespace-nowrap"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Mobile: day cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {weekDates.map((date) => {
              const dayBookings = weekBookings.filter((b) => b.date === date);
              return (
                <div key={date} style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl shadow-sm overflow-hidden">
                  <div
                    style={{
                      backgroundColor: date === todayISO() ? "#E8F7F1" : "#FAFAF8",
                      borderBottom: "1px solid #E8E3DA",
                    }}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <span style={{ color: date === todayISO() ? "#3D7A5B" : "#3D4A43" }} className="font-extrabold text-sm">
                      {formatDayHeader(date)}
                    </span>
                    <span style={{ color: "#6B7A72" }} className="text-xs font-bold">{dayBookings.length} booking{dayBookings.length !== 1 ? "s" : ""}</span>
                  </div>
                  {dayBookings.length === 0 ? (
                    <div className="px-4 py-5 text-center" style={{ color: "#B0B8B3" }}>
                      <p className="text-xs font-semibold">No bookings</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {dayBookings.map((b) => {
                        const assignedStaff = staff.find((s) => s.id === b.staffId);
                        return (
                          <div key={b.id} style={{ borderBottom: "1px solid #F0EDE6" }} className="px-4 py-3 flex items-center gap-3 last:border-b-0">
                            <PetAvatar type={b.petType} size={32} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span style={{ color: "#3D4A43" }} className="font-bold text-sm truncate">{b.petName}</span>
                                <StatusPill status={b.status} />
                              </div>
                              <div style={{ color: "#6B7A72" }} className="text-xs font-semibold mt-0.5">{b.timeRange}</div>
                            </div>
                            {b.status === "Waiting" ? (
                              <button
                                onClick={() => onEditBooking(b)}
                                style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                                className="text-xs font-bold px-2.5 py-1 rounded-full hover:border-[#F6C453] hover:text-[#3D4A43] transition-all whitespace-nowrap shrink-0"
                              >
                                Edit
                              </button>
                            ) : (
                              <span style={{ color: assignedStaff ? "#3D4A43" : "#B0B8B3" }} className="text-xs font-semibold shrink-0">
                                {assignedStaff ? assignedStaff.name : "—"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: 7-column grid */}
          <div className="hidden sm:grid sm:grid-cols-7 sm:gap-3">
            {weekDates.map((date) => {
              const dayBookings = weekBookings.filter((b) => b.date === date);
              const isToday = date === todayISO();
              return (
                <div key={date} style={{ backgroundColor: "#fff", border: isToday ? "2px solid #7FC8A9" : "1px solid #E8E3DA" }} className="rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div
                    style={{ backgroundColor: isToday ? "#E8F7F1" : "#FAFAF8", borderBottom: "1px solid #E8E3DA" }}
                    className="px-3 py-2.5 text-center"
                  >
                    <div style={{ color: isToday ? "#3D7A5B" : "#3D4A43" }} className="font-extrabold text-xs">
                      {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                    </div>
                    <div style={{ color: isToday ? "#3D7A5B" : "#6B7A72" }} className="font-bold text-lg">
                      {new Date(date + "T00:00:00").getDate()}
                    </div>
                  </div>
                  <div className="flex-1 px-2 py-2 flex flex-col gap-1.5">
                    {dayBookings.length === 0 ? (
                      <p style={{ color: "#B0B8B3" }} className="text-[10px] font-semibold text-center py-3">No bookings</p>
                    ) : (
                      dayBookings.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={b.status === "Waiting" ? () => onEditBooking(b) : undefined}
                          style={{
                            backgroundColor: b.status === "In-Progress" ? "#E8F2FB" : "#FEF6E0",
                            border: b.status === "In-Progress" ? "1px solid #7FB3E0" : "1px solid #F6C453",
                            cursor: b.status === "Waiting" ? "pointer" : "default",
                          }}
                          className="rounded-lg px-2 py-1.5 text-left w-full transition-all hover:opacity-80"
                        >
                          <div className="flex items-center gap-1.5">
                            <span style={{ color: petColor(b.petType) }} className="shrink-0"><PetIcon type={b.petType} size={12} /></span>
                            <span style={{ color: "#3D4A43" }} className="font-bold text-[11px] truncate">{b.petName}</span>
                          </div>
                          <div style={{ color: "#6B7A72" }} className="text-[10px] font-semibold mt-0.5 truncate">{b.timeRange}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Add Booking ──────────────────────────────────────────────────────────────

function AddBookingScreen({
  onBack,
  onConfirm,
}: {
  onBack: () => void;
  onConfirm: (petName: string, petType: PetType, date: string, timeRange: string, phone: string) => void;
}) {
  const [petName, setPetName] = useState("");
  const [petType, setPetType] = useState<PetType>("Dog");
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [phone, setPhone] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);

  const petTypes: PetType[] = ["Dog", "Cat", "Rabbit", "Other"];
  const timeRangeValid = isValidTimeInterval(startTime, endTime);
  const timeRange = formatTimeRange(startTime, endTime);

  const handleConfirm = () => {
    if (!petName.trim() || !date) return;
    if (!timeRangeValid) {
      setTimeError("End time must be after start time");
      return;
    }
    onConfirm(petName.trim(), petType, date, timeRange, phone.trim());
  };

  return (
    <div className="min-h-full">
      {/* Top Bar */}
      <header style={{ backgroundColor: "#fff", borderBottom: "1px solid #E8E3DA" }} className="sticky top-0 z-10 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBack}
            style={{ color: "#6B7A72" }}
            className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity"
          >
            <ArrowLeftIcon size={16} /> Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl shadow-sm p-5 sm:p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div style={{ backgroundColor: "#7FC8A9" }} className="w-10 h-10 rounded-xl flex items-center justify-center text-white">
              <PawIcon size={22} />
            </div>
            <h1 style={{ color: "#3D4A43" }} className="text-xl sm:text-2xl font-extrabold tracking-tight">Add New Booking</h1>
          </div>
          <p style={{ color: "#6B7A72" }} className="text-sm font-semibold mb-8">Book a spa session — tracked by pet name only</p>

          {/* Pet Name */}
          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Pet Name</label>
            <input
              type="text"
              placeholder="e.g. Bella"
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
              style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
            />
          </div>

          {/* Phone Number */}
          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. 081-234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
            />
          </div>

          {/* Pet Type */}
          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-3">Pet Type</label>
            <div className="grid grid-cols-4 gap-3">
              {petTypes.map((t) => {
                const selected = petType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setPetType(t)}
                    style={{
                      backgroundColor: selected ? "#E8F7F1" : "#FAFAF8",
                      border: selected ? "2px solid #7FC8A9" : "1.5px solid #E8E3DA",
                      color: selected ? "#3D7A5B" : "#6B7A72",
                    }}
                    className="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:border-[#7FC8A9]"
                  >
                    {selected && (
                      <div style={{ backgroundColor: "#7FC8A9" }} className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center">
                        <CheckIcon size={10} className="text-white" />
                      </div>
                    )}
                    <div style={{ backgroundColor: selected ? "#7FC8A9" : petColor(t), opacity: selected ? 1 : 0.8 }} className="w-10 h-10 rounded-full flex items-center justify-center text-white">
                      <PetIcon type={t} size={22} />
                    </div>
                    <span className="text-xs font-bold">{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date */}
          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors cursor-pointer"
            />
          </div>

          {/* Time Interval */}
          <div className="mb-8">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Time Interval</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start-time" style={{ color: "#6B7A72" }} className="block text-xs font-semibold mb-1.5">Start</label>
                <input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setTimeError(null);
                  }}
                  style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                  className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors cursor-pointer"
                />
              </div>
              <div>
                <label htmlFor="end-time" style={{ color: "#6B7A72" }} className="block text-xs font-semibold mb-1.5">End</label>
                <input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setTimeError(null);
                  }}
                  style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                  className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors cursor-pointer"
                />
              </div>
            </div>
            <p style={{ color: timeRangeValid ? "#6B7A72" : "#B91C1C" }} className="text-xs font-semibold mt-3">
              {timeRangeValid ? `Session: ${timeRange}` : "End time must be after start time"}
            </p>
            {timeError && (
              <p style={{ color: "#B91C1C" }} className="text-xs font-semibold mt-2">{timeError}</p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onBack}
              style={{ border: "2px solid #E8E3DA", color: "#6B7A72", backgroundColor: "transparent" }}
              className="flex-1 py-3 rounded-full font-bold text-sm hover:border-[#3D4A43] hover:text-[#3D4A43] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{ backgroundColor: petName.trim() && date && timeRangeValid ? "#7FC8A9" : "#C8E8DA", color: "#fff" }}
              className="flex-2 flex-grow py-3 rounded-full font-bold text-sm transition-all active:scale-95 shadow-sm disabled:cursor-not-allowed"
              disabled={!petName.trim() || !date || !timeRangeValid}
            >
              Confirm Booking
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Edit Booking ─────────────────────────────────────────────────────────────

function EditBookingScreen({
  booking,
  onBack,
  onConfirm,
}: {
  booking: Booking;
  onBack: () => void;
  onConfirm: (id: number, petName: string, petType: PetType, date: string, timeRange: string, phone: string) => void;
}) {
  const [petName, setPetName] = useState(booking.petName);
  const [petType, setPetType] = useState<PetType>(booking.petType);
  const [date, setDate] = useState(booking.date);

  const parseTimeRange = (range: string) => {
    const match = range.match(/(\d{1,2}:\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}:\d{2})\s*(AM|PM)/i);
    if (!match) return { start: "10:00", end: "12:00" };

    const to24 = (time: string, period: string) => {
      let [h, m] = time.split(":").map(Number);
      if (period.toUpperCase() === "PM" && h !== 12) h += 12;
      if (period.toUpperCase() === "AM" && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };

    return { start: to24(match[1], match[2]), end: to24(match[3], match[4]) };
  };

  const initial = parseTimeRange(booking.timeRange);
  const [startTime, setStartTime] = useState(initial.start);
  const [endTime, setEndTime] = useState(initial.end);
  const [phone, setPhone] = useState(booking.phone);
  const [timeError, setTimeError] = useState<string | null>(null);

  const petTypes: PetType[] = ["Dog", "Cat", "Rabbit", "Other"];
  const timeRangeValid = isValidTimeInterval(startTime, endTime);
  const timeRange = formatTimeRange(startTime, endTime);

  const handleConfirm = () => {
    if (!petName.trim() || !date) return;
    if (!timeRangeValid) {
      setTimeError("End time must be after start time");
      return;
    }
    onConfirm(booking.id, petName.trim(), petType, date, timeRange, phone.trim());
  };

  return (
    <div className="min-h-full">
      <header style={{ backgroundColor: "#fff", borderBottom: "1px solid #E8E3DA" }} className="sticky top-0 z-10 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBack}
            style={{ color: "#6B7A72" }}
            className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity"
          >
            <ArrowLeftIcon size={16} /> Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl shadow-sm p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div style={{ backgroundColor: "#F6C453" }} className="w-10 h-10 rounded-xl flex items-center justify-center text-white">
              <PawIcon size={22} />
            </div>
            <h1 style={{ color: "#3D4A43" }} className="text-xl sm:text-2xl font-extrabold tracking-tight">Edit Booking</h1>
          </div>
          <p style={{ color: "#6B7A72" }} className="text-sm font-semibold mb-8">Update booking details for {booking.petName}</p>

          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Pet Name</label>
            <input
              type="text"
              placeholder="e.g. Bella"
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
              style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
            />
          </div>

          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. 081-234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
            />
          </div>

          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-3">Pet Type</label>
            <div className="grid grid-cols-4 gap-3">
              {petTypes.map((t) => {
                const selected = petType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setPetType(t)}
                    style={{
                      backgroundColor: selected ? "#E8F7F1" : "#FAFAF8",
                      border: selected ? "2px solid #7FC8A9" : "1.5px solid #E8E3DA",
                      color: selected ? "#3D7A5B" : "#6B7A72",
                    }}
                    className="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:border-[#7FC8A9]"
                  >
                    {selected && (
                      <div style={{ backgroundColor: "#7FC8A9" }} className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center">
                        <CheckIcon size={10} className="text-white" />
                      </div>
                    )}
                    <div style={{ backgroundColor: selected ? "#7FC8A9" : petColor(t), opacity: selected ? 1 : 0.8 }} className="w-10 h-10 rounded-full flex items-center justify-center text-white">
                      <PetIcon type={t} size={22} />
                    </div>
                    <span className="text-xs font-bold">{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors cursor-pointer"
            />
          </div>

          <div className="mb-8">
            <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Time Interval</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-start-time" style={{ color: "#6B7A72" }} className="block text-xs font-semibold mb-1.5">Start</label>
                <input
                  id="edit-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setTimeError(null);
                  }}
                  style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                  className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors cursor-pointer"
                />
              </div>
              <div>
                <label htmlFor="edit-end-time" style={{ color: "#6B7A72" }} className="block text-xs font-semibold mb-1.5">End</label>
                <input
                  id="edit-end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setTimeError(null);
                  }}
                  style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                  className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors cursor-pointer"
                />
              </div>
            </div>
            <p style={{ color: timeRangeValid ? "#6B7A72" : "#B91C1C" }} className="text-xs font-semibold mt-3">
              {timeRangeValid ? `Session: ${timeRange}` : "End time must be after start time"}
            </p>
            {timeError && (
              <p style={{ color: "#B91C1C" }} className="text-xs font-semibold mt-2">{timeError}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onBack}
              style={{ border: "2px solid #E8E3DA", color: "#6B7A72", backgroundColor: "transparent" }}
              className="flex-1 py-3 rounded-full font-bold text-sm hover:border-[#3D4A43] hover:text-[#3D4A43] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{ backgroundColor: petName.trim() && date && timeRangeValid ? "#F6C453" : "#E8DFC8", color: "#3D4A43" }}
              className="flex-2 flex-grow py-3 rounded-full font-bold text-sm transition-all active:scale-95 shadow-sm disabled:cursor-not-allowed"
              disabled={!petName.trim() || !date || !timeRangeValid}
            >
              Save Changes
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Manage Staff ─────────────────────────────────────────────────────────────

const STAFF_ROLES = ["Senior Groomer", "Groomer", "Groomer Trainee", "Bath Specialist"];

function ManageStaffScreen({
  staff,
  onBack,
  onCreate,
  onUpdate,
  onDelete,
}: {
  staff: Staff[];
  onBack: () => void;
  onCreate: (name: string, role: string, username: string, password: string) => Promise<void>;
  onUpdate: (id: number, name: string, role: string, username: string, password?: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(STAFF_ROLES[1]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !username.trim() || !password) return;
    setSaving(true);
    setFormError(null);
    try {
      await onCreate(name.trim(), role, username.trim(), password);
      setName("");
      setRole(STAFF_ROLES[1]);
      setUsername("");
      setPassword("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add staff");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (member: Staff) => {
    setEditingId(member.id);
    setEditName(member.name);
    setEditRole(member.role);
    setEditUsername(member.username);
    setEditPassword("");
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditRole("");
    setEditUsername("");
    setEditPassword("");
  };

  const handleSaveEdit = async (id: number) => {
    if (!editName.trim() || !editRole.trim() || !editUsername.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await onUpdate(
        id,
        editName.trim(),
        editRole.trim(),
        editUsername.trim(),
        editPassword || undefined,
      );
      cancelEdit();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update staff");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member: Staff) => {
    if (member.busyWith) {
      setFormError(`Cannot remove ${member.name} while busy with ${member.busyWith}`);
      return;
    }
    if (!window.confirm(`Remove ${member.name} from the team?`)) return;

    setSaving(true);
    setFormError(null);
    try {
      await onDelete(member.id);
      if (editingId === member.id) cancelEdit();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to remove staff");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full">
      <header style={{ backgroundColor: "#fff", borderBottom: "1px solid #E8E3DA" }} className="sticky top-0 z-10 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBack}
            style={{ color: "#6B7A72" }}
            className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity"
          >
            <ArrowLeftIcon size={16} /> Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h1 style={{ color: "#3D4A43" }} className="text-2xl sm:text-3xl font-extrabold tracking-tight">Manage Staff</h1>
          <p style={{ color: "#6B7A72" }} className="text-xs sm:text-sm mt-0.5 font-semibold">Add, edit, or remove groomers on your team</p>
        </div>

        {formError && (
          <p style={{ color: "#B91C1C", backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }} className="mb-4 rounded-xl px-4 py-3 text-sm font-semibold">
            {formError}
          </p>
        )}

        <section style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
          <h2 style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="text-xs font-extrabold uppercase mb-4">Add Team Member</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label htmlFor="staff-name" style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Name</label>
              <input
                id="staff-name"
                type="text"
                placeholder="e.g. Alex Chen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
              />
            </div>
            <div>
              <label htmlFor="staff-role" style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Role</label>
              <select
                id="staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors appearance-none cursor-pointer"
              >
                {STAFF_ROLES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="staff-username" style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Username</label>
              <input
                id="staff-username"
                type="text"
                autoComplete="off"
                placeholder="e.g. alexchen"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
              />
            </div>
            <div>
              <label htmlFor="staff-password" style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Password</label>
              <input
                id="staff-password"
                type="password"
                autoComplete="new-password"
                placeholder="Login password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
              />
            </div>
          </div>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || !username.trim() || !password || saving}
            style={{ backgroundColor: name.trim() && username.trim() && password && !saving ? "#7FC8A9" : "#C8E8DA", color: "#fff" }}
            className="px-5 py-3 rounded-full font-bold text-sm shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Add Staff
          </button>
        </section>

        <section>
          <h2 style={{ color: "#6B7A72", letterSpacing: "0.1em" }} className="text-xs font-extrabold uppercase mb-3 sm:mb-4">
            Team ({staff.length})
          </h2>

          {staff.length === 0 ? (
            <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl p-10 text-center shadow-sm">
              <UserIcon size={28} className="mx-auto mb-3 text-[#B0B8B3]" />
              <p style={{ color: "#B0B8B3" }} className="font-semibold text-sm">No staff members yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {staff.map((member) => {
                const isEditing = editingId === member.id;

                return (
                  <div
                    key={member.id}
                    style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }}
                    className="rounded-2xl p-4 sm:p-5 shadow-sm"
                  >
                    {isEditing ? (
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-extrabold uppercase mb-2" style={{ color: "#6B7A72", letterSpacing: "0.08em" }}>Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                            className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold uppercase mb-2" style={{ color: "#6B7A72", letterSpacing: "0.08em" }}>Role</label>
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                            className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors appearance-none cursor-pointer"
                          >
                            {STAFF_ROLES.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            {!STAFF_ROLES.includes(editRole) && (
                              <option value={editRole}>{editRole}</option>
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold uppercase mb-2" style={{ color: "#6B7A72", letterSpacing: "0.08em" }}>Username</label>
                          <input
                            type="text"
                            autoComplete="off"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                            className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold uppercase mb-2" style={{ color: "#6B7A72", letterSpacing: "0.08em" }}>New Password</label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            placeholder="Leave blank to keep current"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
                            className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors placeholder:text-[#C0C8C2]"
                          />
                        </div>
                        <div className="sm:col-span-2 flex gap-2">
                          <button
                            onClick={() => void handleSaveEdit(member.id)}
                            disabled={!editName.trim() || !editRole.trim() || !editUsername.trim() || saving}
                            style={{ backgroundColor: "#7FC8A9", color: "#fff" }}
                            className="px-4 py-3 rounded-full font-bold text-sm shadow-sm disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                            className="px-4 py-3 rounded-full font-bold text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <StaffAvatar staff={member} size={48} />
                          <div className="min-w-0">
                            <div style={{ color: "#3D4A43" }} className="font-extrabold text-base truncate">{member.name}</div>
                            <div style={{ color: "#6B7A72" }} className="text-xs font-semibold mt-0.5">{member.role}</div>
                            <div style={{ color: "#B0B8B3" }} className="text-xs font-semibold mt-0.5">@{member.username}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          {member.busyWith ? (
                            <span style={{ backgroundColor: "#FEF6E0", color: "#C49430", border: "1.5px solid #F6C453" }} className="text-xs font-bold px-2.5 py-1 rounded-full">
                              Busy · {member.busyWith}
                            </span>
                          ) : (
                            <span style={{ backgroundColor: "#E8F7F1", color: "#4B9A74", border: "1.5px solid #7FC8A9" }} className="text-xs font-bold px-2.5 py-1 rounded-full">
                              Available
                            </span>
                          )}
                          <button
                            onClick={() => startEdit(member)}
                            style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                            className="text-xs font-bold px-3 py-1.5 rounded-full hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDelete(member)}
                            disabled={saving || !!member.busyWith}
                            style={{ border: "1.5px solid #FECACA", color: member.busyWith ? "#D1A3A3" : "#B91C1C" }}
                            className="text-xs font-bold px-3 py-1.5 rounded-full hover:border-[#B91C1C] transition-colors disabled:cursor-not-allowed"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Session History ──────────────────────────────────────────────────────────

function HistoryScreen({
  session,
  onBack,
}: {
  session: AuthSession;
  onBack: () => void;
}) {
  const now = new Date();
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [dateFilter, setDateFilter] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [monthlyHistory, setMonthlyHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [records, monthlyRecords] = await Promise.all([
        api.fetchHistory({
          date: dateFilter || undefined,
          staffId: session.role === "staff" ? session.staffId : undefined,
        }),
        api.fetchHistory({
          month,
          year,
          staffId: session.role === "staff" ? session.staffId : undefined,
        }),
      ]);
      setHistory(records);
      setMonthlyHistory(monthlyRecords);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, month, year, session]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const monthlyTotal = monthlyHistory.reduce((sum, r) => sum + r.amount, 0);
  const monthLabel = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const handlePrevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else { setMonth(month - 1); }
  };

  const handleNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else { setMonth(month + 1); }
  };

  return (
    <div className="min-h-full">
      <header style={{ backgroundColor: "#fff", borderBottom: "1px solid #E8E3DA" }} className="sticky top-0 z-10 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBack}
            style={{ color: "#6B7A72" }}
            className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity"
          >
            <ArrowLeftIcon size={16} /> Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 style={{ color: "#3D4A43" }} className="text-2xl sm:text-3xl font-extrabold tracking-tight">Check-in / Check-out History</h1>
            <p style={{ color: "#6B7A72" }} className="text-xs sm:text-sm mt-0.5 font-semibold">
              {session.role === "staff" ? "Your completed grooming sessions" : "All completed grooming sessions"}
            </p>
          </div>
          <div className="sm:w-52">
            <label htmlFor="history-date-filter" style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">
              Filter by Date
            </label>
            <input
              id="history-date-filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ border: "1.5px solid #E8E3DA", color: "#3D4A43", backgroundColor: "#FAFAF8" }}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none focus:border-[#7FC8A9] transition-colors cursor-pointer"
            />
          </div>
        </div>

        {/* Monthly Income Summary */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl shadow-sm p-5 sm:p-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevMonth}
                style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-colors"
              >
                ‹
              </button>
              <span style={{ color: "#3D4A43" }} className="text-sm sm:text-base font-extrabold min-w-[160px] text-center">
                {monthLabel}
              </span>
              <button
                onClick={handleNextMonth}
                style={{ border: "1.5px solid #E8E3DA", color: "#6B7A72" }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold hover:border-[#7FC8A9] hover:text-[#3D7A5B] transition-colors"
              >
                ›
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="text-xs font-extrabold uppercase mb-1">Monthly Income</div>
                <div style={{ color: "#4B9A74" }} className="text-2xl sm:text-3xl font-extrabold">{monthlyTotal.toLocaleString()} Ks</div>
              </div>
              <div style={{ backgroundColor: "#E8F7F1", border: "1px solid #7FC8A9" }} className="rounded-xl px-4 py-2.5 text-center">
                <div style={{ color: "#3D7A5B" }} className="text-lg sm:text-xl font-extrabold">{monthlyHistory.length}</div>
                <div style={{ color: "#6B7A72" }} className="text-[10px] sm:text-xs font-bold uppercase">Sessions</div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ color: "#B91C1C", backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }} className="mb-4 rounded-xl px-4 py-3 text-sm font-semibold">
            {error}
          </p>
        )}

        {loading ? (
          <p style={{ color: "#6B7A72" }} className="text-sm font-semibold text-center py-12">Loading history…</p>
        ) : history.length === 0 ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl p-12 text-center shadow-sm">
            <CalendarIcon size={32} className="mx-auto mb-3 text-[#B0B8B3]" />
            <p style={{ color: "#B0B8B3" }} className="font-semibold text-sm">No completed sessions yet</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:hidden">
              {history.map((record) => (
                <div key={record.id} style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <PetAvatar type={record.petType} size={40} />
                    <div className="flex-1 min-w-0">
                      <div style={{ color: "#3D4A43" }} className="font-extrabold text-base truncate">{record.petName}</div>
                      <div style={{ color: "#6B7A72" }} className="text-xs font-semibold">{record.petType}</div>
                    </div>
                    <span style={{ backgroundColor: "#E8F7F1", color: "#4B9A74", border: "1.5px solid #7FC8A9" }} className="text-xs font-bold px-2.5 py-1 rounded-full">
                      {record.amount.toLocaleString()} Ks
                    </span>
                  </div>
                  <div style={{ borderTop: "1px solid #F0EDE6" }} className="pt-3 flex flex-col gap-1.5 text-xs font-semibold">
                    <div style={{ color: "#6B7A72" }}>Scheduled: {formatDisplayDate(record.date)} · {record.timeRange}</div>
                    <div style={{ color: "#3D4A43" }}>Check-in: {formatDateTime(record.checkedInAt)}</div>
                    <div style={{ color: "#3D4A43" }}>Check-out: {formatDateTime(record.checkedOutAt)}</div>
                    <div style={{ color: "#6B7A72" }}>Duration: {formatSessionDuration(record.checkedInAt, record.checkedOutAt)}</div>
                    <div style={{ color: "#6B7A72" }}>Staff: {record.staffName ?? "—"}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="hidden sm:block rounded-2xl shadow-sm overflow-hidden">
              <div style={{ borderBottom: "1px solid #E8E3DA", backgroundColor: "#FAFAF8" }} className="grid grid-cols-[1.5fr_1.2fr_1.5fr_1.5fr_1fr_0.8fr] px-6 py-3 gap-4">
                {["Pet", "Scheduled", "Check-in", "Check-out", "Staff", "Amount"].map((heading) => (
                  <div key={heading} style={{ color: "#6B7A72", letterSpacing: "0.07em" }} className="text-xs font-extrabold uppercase">{heading}</div>
                ))}
              </div>
              {history.map((record, index) => (
                <div
                  key={record.id}
                  style={{ borderBottom: index < history.length - 1 ? "1px solid #F0EDE6" : "none" }}
                  className="grid grid-cols-[1.5fr_1.2fr_1.5fr_1.5fr_1fr_0.8fr] px-6 py-4 gap-4 items-center hover:bg-[#FAFAF8] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PetAvatar type={record.petType} size={36} />
                    <div className="min-w-0">
                      <div style={{ color: "#3D4A43" }} className="font-bold text-sm truncate">{record.petName}</div>
                      <div style={{ color: "#6B7A72" }} className="text-xs font-semibold">{record.petType}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#3D4A43" }} className="text-sm font-semibold">{formatDisplayDate(record.date)}</div>
                    <div style={{ color: "#6B7A72" }} className="text-xs font-semibold mt-0.5">{record.timeRange}</div>
                  </div>
                  <span style={{ color: "#3D4A43" }} className="text-sm font-semibold">{formatDateTime(record.checkedInAt)}</span>
                  <div>
                    <div style={{ color: "#3D4A43" }} className="text-sm font-semibold">{formatDateTime(record.checkedOutAt)}</div>
                    <div style={{ color: "#6B7A72" }} className="text-xs font-semibold mt-0.5">
                      {formatSessionDuration(record.checkedInAt, record.checkedOutAt)}
                    </div>
                  </div>
                  <span style={{ color: record.staffName ? "#3D4A43" : "#B0B8B3" }} className="text-sm font-semibold">
                    {record.staffName ?? "—"}
                  </span>
                  <span style={{ color: "#4B9A74" }} className="text-sm font-extrabold">${record.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Check-in Modal ───────────────────────────────────────────────────────────

function CheckinModal({
  booking,
  staff,
  onStartSpa,
  onClose,
}: {
  booking: Booking;
  staff: Staff[];
  onStartSpa: (bookingId: number, staffId: number) => void;
  onClose: () => void;
}) {
  const availableStaff = staff.find((s) => !s.busyWith && !booking.staffId);
  const [selectedStaff, setSelectedStaff] = useState<number | null>(
    availableStaff ? availableStaff.id : null
  );

  const handleStart = () => {
    if (selectedStaff !== null) {
      onStartSpa(booking.id, selectedStaff);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4 overflow-y-auto" style={{ backgroundColor: "rgba(30,40,35,0.45)", backdropFilter: "blur(2px)" }}>
      <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="relative w-full max-w-sm rounded-2xl shadow-xl p-6 sm:p-8 my-auto">
        {/* Close */}
        <button
          onClick={onClose}
          style={{ color: "#6B7A72" }}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F0EDE6] transition-colors font-bold text-lg"
        >
          ×
        </button>

        {/* Pet avatar + title */}
        <div className="flex flex-col items-center mb-5 sm:mb-6">
          <PetAvatar type={booking.petType} size={64} />
          <h2 style={{ color: "#3D4A43" }} className="text-2xl font-extrabold mt-4 mb-1">Check-in</h2>
          <p style={{ color: "#6B7A72" }} className="text-sm font-semibold text-center">
            {booking.petName} · {booking.petType}
          </p>
          <p style={{ color: "#6B7A72" }} className="text-xs font-semibold text-center mt-0.5">
            {formatDisplayDate(booking.date)} · {booking.timeRange}
          </p>
        </div>

        {/* Assign Staff */}
        <div className="mb-6">
          <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-3">Assign Staff</label>
          <div className="flex flex-col gap-2">
            {staff.map((s) => {
              const isBusy = !!s.busyWith;
              const isSelected = selectedStaff === s.id;
              return (
                <button
                  key={s.id}
                  disabled={isBusy}
                  onClick={() => !isBusy && setSelectedStaff(s.id)}
                  style={{
                    backgroundColor: isBusy ? "#F8F7F4" : isSelected ? "#E8F7F1" : "#FAFAF8",
                    border: isSelected ? "2px solid #7FC8A9" : "1.5px solid #E8E3DA",
                    opacity: isBusy ? 0.6 : 1,
                    cursor: isBusy ? "not-allowed" : "pointer",
                  }}
                  className="flex items-center justify-between p-3 rounded-xl transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <StaffAvatar staff={s} size={36} />
                    <div>
                      <div style={{ color: isBusy ? "#B0B8B3" : "#3D4A43" }} className="text-sm font-bold">{s.name}</div>
                      <div style={{ color: "#B0B8B3" }} className="text-xs font-semibold">{s.role}</div>
                    </div>
                  </div>
                  <div>
                    {isBusy ? (
                      <span style={{ color: "#C49430" }} className="text-xs font-bold">Busy with {s.busyWith}</span>
                    ) : isSelected ? (
                      <div style={{ backgroundColor: "#7FC8A9" }} className="w-5 h-5 rounded-full flex items-center justify-center">
                        <CheckIcon size={11} className="text-white" />
                      </div>
                    ) : (
                      <span style={{ color: "#4B9A74" }} className="text-xs font-bold">Available</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={selectedStaff === null}
          style={{ backgroundColor: selectedStaff !== null ? "#7FC8A9" : "#C8E8DA", color: "#fff" }}
          className="w-full py-3.5 rounded-full font-extrabold text-sm shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed"
        >
          Start Spa
        </button>
      </div>
    </div>
  );
}

// ─── Checkout Modal ───────────────────────────────────────────────────────────

function CheckoutModal({
  booking,
  staff,
  onComplete,
  onClose,
}: {
  booking: Booking;
  staff: Staff[];
  onComplete: (bookingId: number, amount: number) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("45.00");
  const assignedStaff = staff.find((s) => s.id === booking.staffId);

  const handleComplete = () => {
    const parsed = parseFloat(amount);
    if (!isNaN(parsed) && parsed >= 0) {
      onComplete(booking.id, parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4 overflow-y-auto" style={{ backgroundColor: "rgba(30,40,35,0.45)", backdropFilter: "blur(2px)" }}>
      <div style={{ backgroundColor: "#fff", border: "1px solid #E8E3DA" }} className="relative w-full max-w-sm rounded-2xl shadow-xl p-6 sm:p-8 my-auto">
        {/* Close */}
        <button
          onClick={onClose}
          style={{ color: "#6B7A72" }}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F0EDE6] transition-colors font-bold text-lg"
        >
          ×
        </button>

        <h2 style={{ color: "#3D4A43" }} className="text-2xl font-extrabold mb-6">Checkout</h2>

        {/* Pet info row */}
        <div style={{ backgroundColor: "#FAFAF8", border: "1px solid #E8E3DA" }} className="rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <PetAvatar type={booking.petType} size={48} />
            <div className="flex-1">
              <div style={{ color: "#3D4A43" }} className="font-extrabold text-base">{booking.petName}</div>
              <div style={{ color: "#6B7A72" }} className="text-xs font-semibold">{booking.petType} · {formatDisplayDate(booking.date)}</div>
              <div style={{ color: "#6B7A72" }} className="text-xs font-semibold">{booking.timeRange}</div>
            </div>
          </div>
          {assignedStaff && (
            <div style={{ borderTop: "1px solid #E8E3DA" }} className="mt-3 pt-3 flex items-center gap-2" >
              <UserIcon size={14} className="text-[#6B7A72]" />
              <span style={{ color: "#6B7A72" }} className="text-xs font-semibold">Assigned to {assignedStaff.name}</span>
            </div>
          )}
        </div>

        {/* Payment */}
        <div className="mb-8">
          <label style={{ color: "#6B7A72", letterSpacing: "0.08em" }} className="block text-xs font-extrabold uppercase mb-2">Payment Amount</label>
          <div style={{ border: "1.5px solid #E8E3DA", backgroundColor: "#FAFAF8" }} className="flex items-center rounded-xl overflow-hidden focus-within:border-[#F6C453] transition-colors">
            <span style={{ backgroundColor: "#F0EDE6", color: "#6B7A72", borderRight: "1.5px solid #E8E3DA" }} className="px-4 py-3 font-bold text-sm">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.01"
              min="0"
              style={{ color: "#3D4A43" }}
              className="flex-1 px-4 py-3 text-sm font-bold outline-none bg-transparent"
            />
          </div>
        </div>

        <button
          onClick={handleComplete}
          style={{ backgroundColor: "#F6C453", color: "#3D4A43" }}
          className="w-full py-3.5 rounded-full font-extrabold text-sm shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <CheckIcon size={15} /> Complete &amp; Checkout
        </button>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const isAuthenticated = session !== null;
  const isAdmin = session?.role === "admin";
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [weekBookings, setWeekBookings] = useState<Booking[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const dates = getWeekDates(weekOffset);
    const [staffData, bookingData, weekData] = await Promise.all([
      api.fetchStaff(),
      api.fetchBookings(todayISO()),
      api.fetchWeekBookings(dates[0], dates[dates.length - 1]),
    ]);
    setStaff(staffData);
    setBookings(bookingData);
    setWeekBookings(weekData);
  }, [weekOffset]);

  useEffect(() => {
    if (session && !isAdmin && (screen === "manage-staff" || screen === "history")) {
      setScreen("dashboard");
    }
  }, [session, isAdmin, screen]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadData();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loadData]);

  const handleLogout = () => {
    clearAuthSession();
    setSession(null);
    setScreen("dashboard");
    setModal(null);
    setActiveBooking(null);
    setEditingBooking(null);
    setBookings([]);
    setStaff([]);
    setError(null);
  };

  const handleCheckin = (b: Booking) => {
    setActiveBooking(b);
    setModal("checkin");
  };

  const handleCheckout = (b: Booking) => {
    setActiveBooking(b);
    setModal("checkout");
  };

  const handleEditBooking = (b: Booking) => {
    setEditingBooking(b);
    setScreen("edit-booking");
  };

  const handleStartSpa = async (bookingId: number, staffId: number) => {
    try {
      await api.checkInBooking(bookingId, staffId);
      await loadData();
      setModal(null);
      setActiveBooking(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    }
  };

  const handleComplete = async (bookingId: number, amount: number) => {
    try {
      await api.checkoutBooking(bookingId, amount);
      await loadData();
      setModal(null);
      setActiveBooking(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    }
  };

  const handleAddBooking = async (petName: string, petType: PetType, date: string, timeRange: string, phone: string) => {
    try {
      await api.createBooking({ petName, petType, phone, date, timeRange });
      await loadData();
      setScreen("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    }
  };

  const handleUpdateBooking = async (id: number, petName: string, petType: PetType, date: string, timeRange: string, phone: string) => {
    try {
      await api.updateBooking(id, { petName, petType, phone, date, timeRange });
      await loadData();
      setEditingBooking(null);
      setScreen("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update booking");
    }
  };

  const handleCreateStaff = async (name: string, role: string, username: string, password: string) => {
    await api.createStaff({ name, role, username, password });
    await loadData();
  };

  const handleUpdateStaff = async (
    id: number,
    name: string,
    role: string,
    username: string,
    password?: string,
  ) => {
    await api.updateStaff(id, { name, role, username, password });
    await loadData();
  };

  const handleDeleteStaff = async (id: number) => {
    await api.deleteStaff(id);
    await loadData();
  };

  if (!isAuthenticated) {
    return (
      <div style={{ backgroundColor: "#F7F4EE", minHeight: "100%", fontFamily: "'Nunito', sans-serif" }}>
        <LoginScreen onLogin={setSession} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ backgroundColor: "#F7F4EE", minHeight: "100%", fontFamily: "'Nunito', sans-serif" }} className="flex items-center justify-center">
        <p style={{ color: "#6B7A72" }} className="font-semibold text-sm">Loading FuFu PetSpa…</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#F7F4EE", minHeight: "100%", fontFamily: "'Nunito', sans-serif" }}>
      {error && (
        <div style={{ backgroundColor: "#FEF2F2", borderBottom: "1px solid #FECACA", color: "#B91C1C" }} className="px-4 py-2 text-sm font-semibold text-center">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline">Dismiss</button>
        </div>
      )}
      {screen === "dashboard" && session && (
        <Dashboard
          bookings={bookings}
          weekBookings={weekBookings}
          weekDates={getWeekDates(weekOffset)}
          weekOffset={weekOffset}
          staff={staff}
          session={session}
          isAdmin={isAdmin}
          onAddBooking={() => setScreen("add-booking")}
          onManageStaff={() => setScreen("manage-staff")}
          onViewHistory={() => setScreen("history")}
          onCheckin={handleCheckin}
          onCheckout={handleCheckout}
          onEditBooking={handleEditBooking}
          onChangeWeek={(offset) => setWeekOffset(offset)}
          onLogout={handleLogout}
        />
      )}

      {screen === "manage-staff" && isAdmin && (
        <ManageStaffScreen
          staff={staff}
          onBack={() => setScreen("dashboard")}
          onCreate={handleCreateStaff}
          onUpdate={handleUpdateStaff}
          onDelete={handleDeleteStaff}
        />
      )}

      {screen === "history" && isAdmin && session && (
        <HistoryScreen
          session={session}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {screen === "add-booking" && (
        <AddBookingScreen
          onBack={() => setScreen("dashboard")}
          onConfirm={handleAddBooking}
        />
      )}

      {screen === "edit-booking" && editingBooking && (
        <EditBookingScreen
          booking={editingBooking}
          onBack={() => { setEditingBooking(null); setScreen("dashboard"); }}
          onConfirm={handleUpdateBooking}
        />
      )}

      {modal === "checkin" && activeBooking && (
        <CheckinModal
          booking={activeBooking}
          staff={staff}
          onStartSpa={handleStartSpa}
          onClose={() => { setModal(null); setActiveBooking(null); }}
        />
      )}

      {modal === "checkout" && activeBooking && (
        <CheckoutModal
          booking={activeBooking}
          staff={staff}
          onComplete={handleComplete}
          onClose={() => { setModal(null); setActiveBooking(null); }}
        />
      )}
    </div>
  );
}

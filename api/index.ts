import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────

type PetType = "Dog" | "Cat" | "Rabbit" | "Other";
type BookingStatus = "Waiting" | "In-Progress";
type UserRole = "admin" | "staff";

interface Staff {
  id: number;
  name: string;
  role: string;
  busyWith: string | null;
  username: string;
}
interface Booking {
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
interface AuthSession {
  role: UserRole;
  name: string;
  username: string;
  staffId?: number;
}
interface SessionHistory {
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

// ── Supabase ──────────────────────────────────────────────────────────────

let client: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    client = createClient(url, key);
  }
  return client;
}

// ── Auth ──────────────────────────────────────────────────────────────────

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "iMnL$s491Dih$R";

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [prefix, salt, hash] = stored.split(":");
  if (prefix !== "scrypt" || !salt || !hash) return false;
  const derived = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
  } catch {
    return false;
  }
}

function verifyAdminCredentials(username: string, password: string) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

// ── Mappers ───────────────────────────────────────────────────────────────

function mapStaff(row: any): Staff {
  return { id: row.id, name: row.name, role: row.role, busyWith: row.busy_with, username: row.username };
}
function mapBooking(row: any): Booking {
  return { id: row.id, petName: row.pet_name, petType: row.pet_type, phone: row.phone, date: row.date, timeRange: row.time_range, staffId: row.staff_id, status: row.status, createdBy: row.created_by ?? null, size: row.size ?? null, qty: row.qty ?? null, serviceType: row.service_type ?? null };
}
function mapSessionHistory(row: any): SessionHistory {
  return { id: row.id, petName: row.pet_name, petType: row.pet_type, phone: row.phone, date: row.date, timeRange: row.time_range, staffId: row.staff_id, staffName: row.staff_name, checkedInAt: row.checked_in_at, checkedOutAt: row.checked_out_at, amount: row.amount };
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const pathname = (req.url ?? "").split("?")[0] ?? "";
    if (!pathname.startsWith("/api/")) return res.status(404).json({ error: "Not found" });

    const db = getSupabase();
    const method = req.method ?? "GET";

    // Login
    if (method === "POST" && pathname === "/api/login") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const username = body?.username?.trim() ?? "";
      const password = body?.password ?? "";
      if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

      if (verifyAdminCredentials(username, password)) {
        return res.status(200).json({ role: "admin", name: "Administrator", username } as AuthSession);
      }

      const { data: staffMember, error: staffErr } = await db
        .from("staff").select("id, name, role, busy_with, username, password_hash").eq("username", username).single();
      if (staffErr || !staffMember) return res.status(401).json({ error: "Invalid username or password" });
      if (!verifyPassword(password, staffMember.password_hash)) return res.status(401).json({ error: "Invalid username or password" });

      return res.status(200).json({ role: "staff", name: staffMember.name, username: staffMember.username, staffId: staffMember.id } as AuthSession);
    }

    // Staff list
    if (method === "GET" && pathname === "/api/staff") {
      const { data, error } = await db.from("staff").select("id, name, role, busy_with, username").order("id");
      if (error) throw new Error(error.message);
      return res.status(200).json(data.map(mapStaff));
    }

    // Create staff
    if (method === "POST" && pathname === "/api/staff") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body?.name?.trim() || !body?.role?.trim() || !body?.username?.trim() || !body?.password) {
        return res.status(400).json({ error: "Name, role, username, and password are required" });
      }
      const username = body.username.trim().toLowerCase();
      if (username === "admin") return res.status(400).json({ error: "This username is reserved" });
      const { data: existing } = await db.from("staff").select("id").eq("username", username).maybeSingle();
      if (existing) return res.status(409).json({ error: "Username is already taken" });

      const { data: inserted, error: insertErr } = await db.from("staff").insert({
        name: body.name.trim(), role: body.role.trim(), busy_with: null, username, password_hash: hashPassword(body.password),
      }).select("id, name, role, busy_with, username").single();
      if (insertErr) throw new Error(insertErr.message);
      return res.status(201).json(mapStaff(inserted));
    }

    // Staff by ID
    const staffMatch = pathname.match(/^\/api\/staff\/(\d+)$/);
    if (staffMatch) {
      const staffId = Number(staffMatch[1]);
      if (method === "PATCH") {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        if (!body?.name?.trim() || !body?.role?.trim() || !body?.username?.trim()) return res.status(400).json({ error: "Name, role, and username are required" });
        const { data: existing } = await db.from("staff").select("id").eq("id", staffId).maybeSingle();
        if (!existing) return res.status(404).json({ error: "Staff not found" });
        const username = body.username.trim().toLowerCase();
        if (username === "admin") return res.status(400).json({ error: "This username is reserved" });
        const { data: taken } = await db.from("staff").select("id").eq("username", username).neq("id", staffId).maybeSingle();
        if (taken) return res.status(409).json({ error: "Username is already taken" });
        const updates: any = { name: body.name.trim(), role: body.role.trim(), username };
        if (body.password) updates.password_hash = hashPassword(body.password);
        await db.from("staff").update(updates).eq("id", staffId);
        const { data: row } = await db.from("staff").select("id, name, role, busy_with, username").eq("id", staffId).single();
        return res.status(200).json(mapStaff(row));
      }
      if (method === "DELETE") {
        const { data: existing } = await db.from("staff").select("id, busy_with").eq("id", staffId).single();
        if (!existing) return res.status(404).json({ error: "Staff not found" });
        if (existing.busy_with) return res.status(409).json({ error: "Cannot remove staff while they are busy" });
        const { data: active } = await db.from("bookings").select("id").eq("staff_id", staffId).eq("status", "In-Progress").limit(1).maybeSingle();
        if (active) return res.status(409).json({ error: "Cannot remove staff with an active booking" });
        await db.from("staff").delete().eq("id", staffId);
        return res.status(200).json({ ok: true });
      }
    }

    // Bookings list
    if (method === "GET" && pathname === "/api/bookings") {
      const url = new URL(req.url ?? "", "http://localhost");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      const date = url.searchParams.get("date");
      let query = db.from("bookings").select("id, pet_name, pet_type, phone, date, time_range, staff_id, status, created_by, size, qty, service_type");
      if (startDate && endDate) {
        query = query.gte("date", startDate).lte("date", endDate).order("date").order("id");
      } else {
        query = query.eq("date", date ?? todayISO()).order("id");
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.status(200).json(data.map(mapBooking));
    }

    // Create booking
    if (method === "POST" && pathname === "/api/bookings") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body?.petName?.trim() || !body?.petType || !body?.date || !body?.timeRange) return res.status(400).json({ error: "Missing required booking fields" });
      const { data: inserted, error: insertErr } = await db.from("bookings").insert({
        pet_name: body.petName.trim(), pet_type: body.petType, phone: body.phone?.trim() ?? "",
        date: body.date, time_range: body.timeRange, staff_id: null, status: "Waiting",
        created_by: body.createdBy ?? null, size: body.size ?? null, qty: body.qty ?? null, service_type: body.serviceType ?? null,
      }).select("id, pet_name, pet_type, phone, date, time_range, staff_id, status, created_by, size, qty, service_type").single();
      if (insertErr) throw new Error(insertErr.message);
      return res.status(201).json(mapBooking(inserted));
    }

    // Edit booking
    const bookingIdMatch = pathname.match(/^\/api\/bookings\/(\d+)$/);
    if (bookingIdMatch && method === "PATCH") {
      const bookingId = Number(bookingIdMatch[1]);
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { data: existing } = await db.from("bookings").select("id, status").eq("id", bookingId).single();
      if (!existing) return res.status(404).json({ error: "Booking not found" });
      if (existing.status !== "Waiting") return res.status(409).json({ error: "Only waiting bookings can be edited" });
      if (!body?.petName?.trim() || !body?.petType || !body?.date || !body?.timeRange) return res.status(400).json({ error: "Missing required booking fields" });
      await db.from("bookings").update({
        pet_name: body.petName.trim(), pet_type: body.petType, phone: body.phone?.trim() ?? "",
        date: body.date, time_range: body.timeRange, size: body.size ?? null, qty: body.qty ?? null, service_type: body.serviceType ?? null,
      }).eq("id", bookingId);
      const { data: row } = await db.from("bookings").select("id, pet_name, pet_type, phone, date, time_range, staff_id, status, created_by, size, qty, service_type").eq("id", bookingId).single();
      return res.status(200).json(mapBooking(row));
    }

    // Delete booking (admin only)
    if (bookingIdMatch && method === "DELETE") {
      const bookingId = Number(bookingIdMatch[1]);
      const { data: existing } = await db.from("bookings").select("id, status, staff_id").eq("id", bookingId).single();
      if (!existing) return res.status(404).json({ error: "Booking not found" });
      if (existing.status === "In-Progress" && existing.staff_id) {
        await db.from("staff").update({ busy_with: null }).eq("id", existing.staff_id);
      }
      await db.from("bookings").delete().eq("id", bookingId);
      return res.status(200).json({ ok: true });
    }

    // Check-in (RPC)
    const checkinMatch = pathname.match(/^\/api\/bookings\/(\d+)\/checkin$/);
    if (method === "PATCH" && checkinMatch) {
      const bookingId = Number(checkinMatch[1]);
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body?.staffId) return res.status(400).json({ error: "staffId is required" });
      const { data: result, error: rpcError } = await db.rpc("checkin_booking", { p_booking_id: bookingId, p_staff_id: body.staffId });
      if (rpcError) {
        const msg = rpcError.message;
        if (msg.includes("Booking not found")) return res.status(404).json({ error: "Booking not found" });
        if (msg.includes("Staff not found")) return res.status(404).json({ error: "Staff not found" });
        if (msg.includes("already busy")) return res.status(409).json({ error: "Staff member is already busy" });
        throw new Error(msg);
      }
      return res.status(200).json(mapBooking(result));
    }

    // Checkout (RPC)
    const checkoutMatch = pathname.match(/^\/api\/bookings\/(\d+)\/checkout$/);
    if (method === "POST" && checkoutMatch) {
      const bookingId = Number(checkoutMatch[1]);
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (body?.amount === undefined || Number.isNaN(body.amount) || body.amount < 0) return res.status(400).json({ error: "Valid payment amount is required" });
      const { data: result, error: rpcError } = await db.rpc("checkout_booking", { p_booking_id: bookingId, p_amount: body.amount });
      if (rpcError) {
        if (rpcError.message.includes("Booking not found")) return res.status(404).json({ error: "Booking not found" });
        throw new Error(rpcError.message);
      }
      return res.status(200).json(result);
    }

    // History
    if (method === "GET" && pathname === "/api/history") {
      const url = new URL(req.url ?? "", "http://localhost");
      const date = url.searchParams.get("date");
      const month = url.searchParams.get("month");
      const year = url.searchParams.get("year");
      const staffIdParam = url.searchParams.get("staffId");
      let query = db.from("session_history").select("id, pet_name, pet_type, phone, date, time_range, staff_id, staff_name, checked_in_at, checked_out_at, amount");
      if (date) { query = query.eq("date", date); }
      else if (month && year) {
        const startDate = `${year}-${String(Number(month)).padStart(2, "0")}-01`;
        const endMonth = Number(month) === 12 ? 1 : Number(month) + 1;
        const endYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        query = query.gte("date", startDate).lt("date", endDate);
      }
      if (staffIdParam) { const sid = Number(staffIdParam); if (!Number.isNaN(sid)) query = query.eq("staff_id", sid); }
      query = query.order("checked_out_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.status(200).json(data.map(mapSessionHistory));
    }

    return res.status(404).json({ error: "API route not found" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api]", message);
    return res.status(500).json({ error: message });
  }
}

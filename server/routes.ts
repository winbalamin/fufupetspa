import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthSession, Booking, PetType, SessionHistory, Staff } from "../src/types";
import { hashPassword, verifyAdminCredentials, verifyPassword } from "./auth";
import { getSupabase } from "./supabase";

type StaffRow = {
  id: number;
  name: string;
  role: string;
  busy_with: string | null;
  username: string;
  password_hash?: string;
};

type BookingRow = {
  id: number;
  pet_name: string;
  pet_type: PetType;
  phone: string;
  date: string;
  time_range: string;
  staff_id: number | null;
  status: "Waiting" | "In-Progress";
  checked_in_at?: string | null;
};

type SessionHistoryRow = {
  id: number;
  pet_name: string;
  pet_type: PetType;
  phone: string;
  date: string;
  time_range: string;
  staff_id: number | null;
  staff_name: string | null;
  checked_in_at: string;
  checked_out_at: string;
  amount: number;
};

function mapStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    busyWith: row.busy_with,
    username: row.username,
  };
}

function mapSessionHistory(row: SessionHistoryRow): SessionHistory {
  return {
    id: row.id,
    petName: row.pet_name,
    petType: row.pet_type,
    phone: row.phone,
    date: row.date,
    timeRange: row.time_range,
    staffId: row.staff_id,
    staffName: row.staff_name,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    amount: row.amount,
  };
}

function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    petName: row.pet_name,
    petType: row.pet_type,
    phone: row.phone,
    date: row.date,
    timeRange: row.time_range,
    staffId: row.staff_id,
    status: row.status,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith("/api/")) return false;

  const db = getSupabase();
  const method = req.method ?? "GET";

  try {
    // ── Login ──────────────────────────────────────────────────────────────

    if (method === "POST" && pathname === "/api/login") {
      const body = await readJsonBody<{ username?: string; password?: string }>(req);
      const username = body.username?.trim() ?? "";
      const password = body.password ?? "";

      if (!username || !password) {
        sendError(res, 400, "Username and password are required");
        return true;
      }

      if (verifyAdminCredentials(username, password)) {
        const session: AuthSession = {
          role: "admin",
          name: "Administrator",
          username,
        };
        sendJson(res, 200, session);
        return true;
      }

      const { data: staffMember, error: staffErr } = await db
        .from("staff")
        .select("id, name, role, busy_with, username, password_hash")
        .eq("username", username)
        .single();

      if (staffErr) {
        console.error("[api] Supabase query error:", staffErr);
        sendError(res, 500, `Database error: ${staffErr.message}`);
        return true;
      }

      if (!staffMember) {
        sendError(res, 401, "Invalid username or password");
        return true;
      }

      if (!verifyPassword(password, staffMember.password_hash)) {
        sendError(res, 401, "Invalid username or password");
        return true;
      }

      const session: AuthSession = {
        role: "staff",
        name: staffMember.name,
        username: staffMember.username,
        staffId: staffMember.id,
      };
      sendJson(res, 200, session);
      return true;
    }

    // ── Staff CRUD ─────────────────────────────────────────────────────────

    if (method === "GET" && pathname === "/api/staff") {
      const { data, error } = await db
        .from("staff")
        .select("id, name, role, busy_with, username")
        .order("id");

      if (error) throw new Error(error.message);
      sendJson(res, 200, (data as StaffRow[]).map(mapStaff));
      return true;
    }

    if (method === "POST" && pathname === "/api/staff") {
      const body = await readJsonBody<{ name?: string; role?: string; username?: string; password?: string }>(req);

      if (!body.name?.trim() || !body.role?.trim() || !body.username?.trim() || !body.password) {
        sendError(res, 400, "Name, role, username, and password are required");
        return true;
      }

      const username = body.username.trim().toLowerCase();
      if (username === "admin") {
        sendError(res, 400, "This username is reserved");
        return true;
      }

      const { data: existing } = await db
        .from("staff")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (existing) {
        sendError(res, 409, "Username is already taken");
        return true;
      }

      const { data: inserted, error: insertErr } = await db
        .from("staff")
        .insert({
          name: body.name.trim(),
          role: body.role.trim(),
          busy_with: null,
          username,
          password_hash: hashPassword(body.password),
        })
        .select("id, name, role, busy_with, username")
        .single();

      if (insertErr) throw new Error(insertErr.message);
      sendJson(res, 201, mapStaff(inserted as StaffRow));
      return true;
    }

    const staffMatch = pathname.match(/^\/api\/staff\/(\d+)$/);
    if (staffMatch) {
      const staffId = Number(staffMatch[1]);

      if (method === "PATCH") {
        const body = await readJsonBody<{ name?: string; role?: string; username?: string; password?: string }>(req);

        if (!body.name?.trim() || !body.role?.trim() || !body.username?.trim()) {
          sendError(res, 400, "Name, role, and username are required");
          return true;
        }

        const { data: existing } = await db
          .from("staff")
          .select("id")
          .eq("id", staffId)
          .maybeSingle();

        if (!existing) {
          sendError(res, 404, "Staff not found");
          return true;
        }

        const username = body.username.trim().toLowerCase();
        if (username === "admin") {
          sendError(res, 400, "This username is reserved");
          return true;
        }

        const { data: taken } = await db
          .from("staff")
          .select("id")
          .eq("username", username)
          .neq("id", staffId)
          .maybeSingle();

        if (taken) {
          sendError(res, 409, "Username is already taken");
          return true;
        }

        const updates: Record<string, unknown> = {
          name: body.name.trim(),
          role: body.role.trim(),
          username,
        };
        if (body.password) {
          updates.password_hash = hashPassword(body.password);
        }

        const { error: updateErr } = await db
          .from("staff")
          .update(updates)
          .eq("id", staffId);

        if (updateErr) throw new Error(updateErr.message);

        const { data: row } = await db
          .from("staff")
          .select("id, name, role, busy_with, username")
          .eq("id", staffId)
          .single();

        sendJson(res, 200, mapStaff(row as StaffRow));
        return true;
      }

      if (method === "DELETE") {
        const { data: existing } = await db
          .from("staff")
          .select("id, busy_with")
          .eq("id", staffId)
          .single();

        if (!existing) {
          sendError(res, 404, "Staff not found");
          return true;
        }

        if (existing.busy_with) {
          sendError(res, 409, "Cannot remove staff while they are busy with a session");
          return true;
        }

        const { data: activeBooking } = await db
          .from("bookings")
          .select("id")
          .eq("staff_id", staffId)
          .eq("status", "In-Progress")
          .limit(1)
          .maybeSingle();

        if (activeBooking) {
          sendError(res, 409, "Cannot remove staff with an active booking");
          return true;
        }

        const { error: deleteErr } = await db
          .from("staff")
          .delete()
          .eq("id", staffId);

        if (deleteErr) throw new Error(deleteErr.message);
        sendJson(res, 200, { ok: true });
        return true;
      }
    }

    // ── Bookings CRUD ──────────────────────────────────────────────────────

    if (method === "GET" && pathname === "/api/bookings") {
      const url = new URL(req.url ?? "", "http://localhost");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      const date = url.searchParams.get("date");

      let query = db
        .from("bookings")
        .select("id, pet_name, pet_type, phone, date, time_range, staff_id, status");

      if (startDate && endDate) {
        query = query.gte("date", startDate).lte("date", endDate).order("date").order("id");
      } else {
        query = query.eq("date", date ?? todayISO()).order("id");
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      sendJson(res, 200, (data as BookingRow[]).map(mapBooking));
      return true;
    }

    if (method === "POST" && pathname === "/api/bookings") {
      const body = await readJsonBody<{
        petName?: string;
        petType?: PetType;
        phone?: string;
        date?: string;
        timeRange?: string;
      }>(req);

      if (!body.petName?.trim() || !body.petType || !body.date || !body.timeRange) {
        sendError(res, 400, "Missing required booking fields");
        return true;
      }

      const { data: inserted, error: insertErr } = await db
        .from("bookings")
        .insert({
          pet_name: body.petName.trim(),
          pet_type: body.petType,
          phone: body.phone?.trim() ?? "",
          date: body.date,
          time_range: body.timeRange,
          staff_id: null,
          status: "Waiting",
        })
        .select("id, pet_name, pet_type, phone, date, time_range, staff_id, status")
        .single();

      if (insertErr) throw new Error(insertErr.message);
      sendJson(res, 201, mapBooking(inserted as BookingRow));
      return true;
    }

    const bookingIdMatch = pathname.match(/^\/api\/bookings\/(\d+)$/);
    if (bookingIdMatch && method === "PATCH") {
      const bookingId = Number(bookingIdMatch[1]);
      const body = await readJsonBody<{
        petName?: string;
        petType?: PetType;
        phone?: string;
        date?: string;
        timeRange?: string;
      }>(req);

      const { data: existing } = await db
        .from("bookings")
        .select("id, status")
        .eq("id", bookingId)
        .single();

      if (!existing) {
        sendError(res, 404, "Booking not found");
        return true;
      }

      if (existing.status !== "Waiting") {
        sendError(res, 409, "Only waiting bookings can be edited");
        return true;
      }

      if (!body.petName?.trim() || !body.petType || !body.date || !body.timeRange) {
        sendError(res, 400, "Missing required booking fields");
        return true;
      }

      const { error: updateErr } = await db
        .from("bookings")
        .update({
          pet_name: body.petName.trim(),
          pet_type: body.petType,
          phone: body.phone?.trim() ?? "",
          date: body.date,
          time_range: body.timeRange,
        })
        .eq("id", bookingId);

      if (updateErr) throw new Error(updateErr.message);

      const { data: row } = await db
        .from("bookings")
        .select("id, pet_name, pet_type, phone, date, time_range, staff_id, status")
        .eq("id", bookingId)
        .single();

      sendJson(res, 200, mapBooking(row as BookingRow));
      return true;
    }

    // ── Check-in (via RPC) ─────────────────────────────────────────────────

    const checkinMatch = pathname.match(/^\/api\/bookings\/(\d+)\/checkin$/);
    if (method === "PATCH" && checkinMatch) {
      const bookingId = Number(checkinMatch[1]);
      const body = await readJsonBody<{ staffId?: number }>(req);

      if (!body.staffId) {
        sendError(res, 400, "staffId is required");
        return true;
      }

      const { data: result, error: rpcError } = await db.rpc("checkin_booking", {
        p_booking_id: bookingId,
        p_staff_id: body.staffId,
      });

      if (rpcError) {
        const msg = rpcError.message;
        if (msg.includes("Booking not found")) {
          sendError(res, 404, "Booking not found");
          return true;
        }
        if (msg.includes("Staff not found")) {
          sendError(res, 404, "Staff not found");
          return true;
        }
        if (msg.includes("already busy")) {
          sendError(res, 409, "Staff member is already busy");
          return true;
        }
        throw new Error(msg);
      }

      sendJson(res, 200, mapBooking(result as BookingRow));
      return true;
    }

    // ── Checkout (via RPC) ─────────────────────────────────────────────────

    const checkoutMatch = pathname.match(/^\/api\/bookings\/(\d+)\/checkout$/);
    if (method === "POST" && checkoutMatch) {
      const bookingId = Number(checkoutMatch[1]);
      const body = await readJsonBody<{ amount?: number }>(req);

      if (body.amount === undefined || Number.isNaN(body.amount) || body.amount < 0) {
        sendError(res, 400, "Valid payment amount is required");
        return true;
      }

      const { data: result, error: rpcError } = await db.rpc("checkout_booking", {
        p_booking_id: bookingId,
        p_amount: body.amount,
      });

      if (rpcError) {
        if (rpcError.message.includes("Booking not found")) {
          sendError(res, 404, "Booking not found");
          return true;
        }
        throw new Error(rpcError.message);
      }

      sendJson(res, 200, result);
      return true;
    }

    // ── History ────────────────────────────────────────────────────────────

    if (method === "GET" && pathname === "/api/history") {
      const url = new URL(req.url ?? "", "http://localhost");
      const date = url.searchParams.get("date");
      const month = url.searchParams.get("month");
      const year = url.searchParams.get("year");
      const staffIdParam = url.searchParams.get("staffId");

      let query = db
        .from("session_history")
        .select(
          "id, pet_name, pet_type, phone, date, time_range, staff_id, staff_name, checked_in_at, checked_out_at, amount",
        );

      if (date) {
        query = query.eq("date", date);
      } else if (month && year) {
        const startDate = `${year}-${String(Number(month)).padStart(2, "0")}-01`;
        const endMonth = Number(month) === 12 ? 1 : Number(month) + 1;
        const endYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        query = query.gte("date", startDate).lt("date", endDate);
      }

      if (staffIdParam) {
        const staffId = Number(staffIdParam);
        if (!Number.isNaN(staffId)) {
          query = query.eq("staff_id", staffId);
        }
      }

      query = query.order("checked_out_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      sendJson(res, 200, (data as SessionHistoryRow[]).map(mapSessionHistory));
      return true;
    }

    sendError(res, 404, "API route not found");
    return true;
  } catch (error) {
    console.error("[api]", error);
    sendError(res, 500, "Internal server error");
    return true;
  }
}

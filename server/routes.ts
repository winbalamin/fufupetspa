import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthSession, Booking, PetType, SessionHistory, Staff } from "../src/types";
import { hashPassword, verifyAdminCredentials, verifyPassword } from "./auth";
import { getDb } from "./db";

type StaffRow = {
  id: number;
  name: string;
  role: string;
  busy_with: string | null;
  username: string;
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

function findStaffByUsername(db: ReturnType<typeof getDb>, username: string) {
  return db
    .prepare("SELECT id, name, role, busy_with, username, password_hash FROM staff WHERE username = ?")
    .get(username) as (StaffRow & { password_hash: string }) | undefined;
}

function usernameTaken(db: ReturnType<typeof getDb>, username: string, excludeId?: number) {
  const existing = db
    .prepare("SELECT id FROM staff WHERE username = ?")
    .get(username) as { id: number } | undefined;
  return existing !== undefined && existing.id !== excludeId;
}

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

  const db = getDb();
  const method = req.method ?? "GET";
  const segments = pathname.split("/").filter(Boolean);

  try {
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

      const staffMember = findStaffByUsername(db, username);
      if (!staffMember || !verifyPassword(password, staffMember.password_hash)) {
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

    if (method === "GET" && pathname === "/api/staff") {
      const rows = db.prepare("SELECT id, name, role, busy_with, username FROM staff ORDER BY id").all() as StaffRow[];
      sendJson(res, 200, rows.map(mapStaff));
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
      if (usernameTaken(db, username)) {
        sendError(res, 409, "Username is already taken");
        return true;
      }

      const result = db
        .prepare("INSERT INTO staff (name, role, busy_with, username, password_hash) VALUES (?, ?, NULL, ?, ?)")
        .run(body.name.trim(), body.role.trim(), username, hashPassword(body.password));

      const row = db
        .prepare("SELECT id, name, role, busy_with, username FROM staff WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as StaffRow;

      sendJson(res, 201, mapStaff(row));
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

        const existing = db
          .prepare("SELECT id FROM staff WHERE id = ?")
          .get(staffId) as { id: number } | undefined;

        if (!existing) {
          sendError(res, 404, "Staff not found");
          return true;
        }

        const username = body.username.trim().toLowerCase();
        if (username === "admin") {
          sendError(res, 400, "This username is reserved");
          return true;
        }
        if (usernameTaken(db, username, staffId)) {
          sendError(res, 409, "Username is already taken");
          return true;
        }

        if (body.password) {
          db.prepare("UPDATE staff SET name = ?, role = ?, username = ?, password_hash = ? WHERE id = ?").run(
            body.name.trim(),
            body.role.trim(),
            username,
            hashPassword(body.password),
            staffId,
          );
        } else {
          db.prepare("UPDATE staff SET name = ?, role = ?, username = ? WHERE id = ?").run(
            body.name.trim(),
            body.role.trim(),
            username,
            staffId,
          );
        }

        const row = db
          .prepare("SELECT id, name, role, busy_with, username FROM staff WHERE id = ?")
          .get(staffId) as StaffRow;

        sendJson(res, 200, mapStaff(row));
        return true;
      }

      if (method === "DELETE") {
        const existing = db
          .prepare("SELECT id, busy_with FROM staff WHERE id = ?")
          .get(staffId) as { id: number; busy_with: string | null } | undefined;

        if (!existing) {
          sendError(res, 404, "Staff not found");
          return true;
        }

        if (existing.busy_with) {
          sendError(res, 409, "Cannot remove staff while they are busy with a session");
          return true;
        }

        const activeBooking = db
          .prepare("SELECT id FROM bookings WHERE staff_id = ? AND status = 'In-Progress' LIMIT 1")
          .get(staffId) as { id: number } | undefined;

        if (activeBooking) {
          sendError(res, 409, "Cannot remove staff with an active booking");
          return true;
        }

        db.prepare("DELETE FROM staff WHERE id = ?").run(staffId);
        sendJson(res, 200, { ok: true });
        return true;
      }
    }

    if (method === "GET" && pathname === "/api/bookings") {
      const url = new URL(req.url ?? "", "http://localhost");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      const date = url.searchParams.get("date");

      let query: string;
      let params: string[];

      if (startDate && endDate) {
        query = `
          SELECT id, pet_name, pet_type, phone, date, time_range, staff_id, status
          FROM bookings
          WHERE date >= ? AND date <= ?
          ORDER BY date, id
        `;
        params = [startDate, endDate];
      } else {
        query = `
          SELECT id, pet_name, pet_type, phone, date, time_range, staff_id, status
          FROM bookings
          WHERE date = ?
          ORDER BY id
        `;
        params = [date ?? todayISO()];
      }

      const rows = db.prepare(query).all(...params) as BookingRow[];
      sendJson(res, 200, rows.map(mapBooking));
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

      const result = db
        .prepare(`
          INSERT INTO bookings (pet_name, pet_type, phone, date, time_range, staff_id, status)
          VALUES (?, ?, ?, ?, ?, NULL, 'Waiting')
        `)
        .run(body.petName.trim(), body.petType, body.phone?.trim() ?? "", body.date, body.timeRange);

      const row = db
        .prepare(`
          SELECT id, pet_name, pet_type, phone, date, time_range, staff_id, status
          FROM bookings
          WHERE id = ?
        `)
        .get(Number(result.lastInsertRowid)) as BookingRow;

      sendJson(res, 201, mapBooking(row));
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

      const existing = db
        .prepare("SELECT id, status FROM bookings WHERE id = ?")
        .get(bookingId) as { id: number; status: string } | undefined;

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

      db.prepare(`
        UPDATE bookings
        SET pet_name = ?, pet_type = ?, phone = ?, date = ?, time_range = ?
        WHERE id = ?
      `).run(
        body.petName.trim(),
        body.petType,
        body.phone?.trim() ?? "",
        body.date,
        body.timeRange,
        bookingId,
      );

      const row = db
        .prepare(`
          SELECT id, pet_name, pet_type, phone, date, time_range, staff_id, status
          FROM bookings
          WHERE id = ?
        `)
        .get(bookingId) as BookingRow;

      sendJson(res, 200, mapBooking(row));
      return true;
    }

    const checkinMatch = pathname.match(/^\/api\/bookings\/(\d+)\/checkin$/);
    if (method === "PATCH" && checkinMatch) {
      const bookingId = Number(checkinMatch[1]);
      const body = await readJsonBody<{ staffId?: number }>(req);

      if (!body.staffId) {
        sendError(res, 400, "staffId is required");
        return true;
      }

      const booking = db
        .prepare("SELECT id, pet_name FROM bookings WHERE id = ?")
        .get(bookingId) as { id: number; pet_name: string } | undefined;

      if (!booking) {
        sendError(res, 404, "Booking not found");
        return true;
      }

      const staff = db
        .prepare("SELECT id, busy_with FROM staff WHERE id = ?")
        .get(body.staffId) as { id: number; busy_with: string | null } | undefined;

      if (!staff) {
        sendError(res, 404, "Staff not found");
        return true;
      }

      if (staff.busy_with) {
        sendError(res, 409, "Staff member is already busy");
        return true;
      }

      const staffId = body.staffId;
      const checkedInAt = new Date().toISOString();
      db.exec("BEGIN");
      try {
        db.prepare(`
          UPDATE bookings
          SET status = 'In-Progress', staff_id = ?, checked_in_at = ?
          WHERE id = ?
        `).run(staffId, checkedInAt, bookingId);

        db.prepare("UPDATE staff SET busy_with = ? WHERE id = ?").run(booking.pet_name, staffId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      const row = db
        .prepare(`
          SELECT id, pet_name, pet_type, phone, date, time_range, staff_id, status
          FROM bookings
          WHERE id = ?
        `)
        .get(bookingId) as BookingRow;

      sendJson(res, 200, mapBooking(row));
      return true;
    }

    const checkoutMatch = pathname.match(/^\/api\/bookings\/(\d+)\/checkout$/);
    if (method === "POST" && checkoutMatch) {
      const bookingId = Number(checkoutMatch[1]);
      const body = await readJsonBody<{ amount?: number }>(req);

      if (body.amount === undefined || Number.isNaN(body.amount) || body.amount < 0) {
        sendError(res, 400, "Valid payment amount is required");
        return true;
      }

      const booking = db
        .prepare(`
          SELECT
            b.id,
            b.pet_name,
            b.pet_type,
            b.phone,
            b.date,
            b.time_range,
            b.staff_id,
            b.checked_in_at,
            s.name AS staff_name
          FROM bookings b
          LEFT JOIN staff s ON s.id = b.staff_id
          WHERE b.id = ?
        `)
        .get(bookingId) as {
          id: number;
          pet_name: string;
          pet_type: PetType;
          phone: string;
          date: string;
          time_range: string;
          staff_id: number | null;
          checked_in_at: string | null;
          staff_name: string | null;
        } | undefined;

      if (!booking) {
        sendError(res, 404, "Booking not found");
        return true;
      }

      const checkedOutAt = new Date().toISOString();
      const checkedInAt = booking.checked_in_at ?? checkedOutAt;

      db.exec("BEGIN");
      try {
        db.prepare(`
          INSERT INTO session_history (
            pet_name, pet_type, phone, date, time_range,
            staff_id, staff_name, checked_in_at, checked_out_at, amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          booking.pet_name,
          booking.pet_type,
          booking.phone,
          booking.date,
          booking.time_range,
          booking.staff_id,
          booking.staff_name,
          checkedInAt,
          checkedOutAt,
          body.amount,
        );

        db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);
        if (booking.staff_id) {
          db.prepare("UPDATE staff SET busy_with = NULL WHERE id = ?").run(booking.staff_id);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      sendJson(res, 200, { ok: true, amount: body.amount });
      return true;
    }

    if (method === "GET" && pathname === "/api/history") {
      const url = new URL(req.url ?? "", "http://localhost");
      const date = url.searchParams.get("date");
      const month = url.searchParams.get("month");
      const year = url.searchParams.get("year");
      const staffIdParam = url.searchParams.get("staffId");
      const staffId = staffIdParam ? Number(staffIdParam) : null;

      let query = `
        SELECT id, pet_name, pet_type, phone, date, time_range,
               staff_id, staff_name, checked_in_at, checked_out_at, amount
        FROM session_history
        WHERE 1 = 1
      `;
      const params: (string | number)[] = [];

      if (date) {
        query += " AND date = ?";
        params.push(date);
      } else if (month && year) {
        const startDate = `${year}-${String(Number(month)).padStart(2, "0")}-01`;
        const endMonth = Number(month) === 12 ? 1 : Number(month) + 1;
        const endYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        query += " AND date >= ? AND date < ?";
        params.push(startDate, endDate);
      }
      if (staffId !== null && !Number.isNaN(staffId)) {
        query += " AND staff_id = ?";
        params.push(staffId);
      }

      query += " ORDER BY checked_out_at DESC";

      const rows = db.prepare(query).all(...params) as SessionHistoryRow[];
      sendJson(res, 200, rows.map(mapSessionHistory));
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

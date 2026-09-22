import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_STAFF_PASSWORD, hashPassword } from "./auth";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "fufu-petspa.db");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function initializeSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      busy_with TEXT,
      username TEXT,
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_name TEXT NOT NULL,
      pet_type TEXT NOT NULL CHECK (pet_type IN ('Dog', 'Cat', 'Rabbit', 'Other')),
      phone TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      time_range TEXT NOT NULL,
      staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('Waiting', 'In-Progress')) DEFAULT 'Waiting',
      checked_in_at TEXT
    );

    CREATE TABLE IF NOT EXISTS session_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_name TEXT NOT NULL,
      pet_type TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      time_range TEXT NOT NULL,
      staff_id INTEGER,
      staff_name TEXT,
      checked_in_at TEXT NOT NULL,
      checked_out_at TEXT NOT NULL,
      amount REAL NOT NULL
    );
  `);

  migrateStaffAuth(db);
  migrateBookingsCheckIn(db);
}

function migrateBookingsCheckIn(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(bookings)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "checked_in_at")) {
    db.exec("ALTER TABLE bookings ADD COLUMN checked_in_at TEXT");
  }
}

function migrateStaffAuth(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(staff)").all() as { name: string }[];
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("username")) {
    db.exec("ALTER TABLE staff ADD COLUMN username TEXT");
  }
  if (!columnNames.has("password_hash")) {
    db.exec("ALTER TABLE staff ADD COLUMN password_hash TEXT");
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username ON staff(username) WHERE username IS NOT NULL");

  const staffWithoutCredentials = db
    .prepare("SELECT id FROM staff WHERE username IS NULL OR password_hash IS NULL")
    .all() as { id: number }[];

  const updateCredentials = db.prepare(
    "UPDATE staff SET username = ?, password_hash = ? WHERE id = ?",
  );

  for (const member of staffWithoutCredentials) {
    updateCredentials.run(`staff${member.id}`, hashPassword(DEFAULT_STAFF_PASSWORD), member.id);
  }
}

function seedIfEmpty(db: DatabaseSync) {
  const staffCount = db.prepare("SELECT COUNT(*) AS count FROM staff").get() as { count: number };
  if (staffCount.count > 0) return;

  const insertStaff = db.prepare(
    "INSERT INTO staff (id, name, role, busy_with, username, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insertStaff.run(1, "Staff 1", "Senior Groomer", "Bella", "staff1", hashPassword(DEFAULT_STAFF_PASSWORD));
  insertStaff.run(2, "Staff 2", "Groomer", "Clover", "staff2", hashPassword(DEFAULT_STAFF_PASSWORD));
  insertStaff.run(3, "Staff 3", "Groomer Trainee", null, "staff3", hashPassword(DEFAULT_STAFF_PASSWORD));

  const today = todayISO();
  const insertBooking = db.prepare(`
    INSERT INTO bookings (id, pet_name, pet_type, phone, date, time_range, staff_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBooking.run(1, "Bella", "Dog", "081-111-2233", today, "10:00 AM – 12:00 PM", 1, "In-Progress");
  insertBooking.run(2, "Mochi", "Cat", "082-345-6789", today, "10:00 AM – 12:00 PM", null, "Waiting");
  insertBooking.run(3, "Clover", "Rabbit", "083-456-7890", today, "1:00 PM – 3:00 PM", 2, "In-Progress");
  insertBooking.run(4, "Biscuit", "Dog", "084-567-8901", today, "2:00 PM – 4:00 PM", null, "Waiting");
}

function createDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON");
  initializeSchema(db);
  seedIfEmpty(db);
  return db;
}

let dbInstance: DatabaseSync | null = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = createDb();
  }
  return dbInstance;
}

export function getDbPath() {
  return DB_PATH;
}

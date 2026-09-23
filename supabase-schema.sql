-- FuFu PetSpa — Supabase Postgres Schema
-- Paste this into Supabase Dashboard > SQL Editor > New Query

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  busy_with TEXT,
  username TEXT UNIQUE,
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL CHECK (pet_type IN ('Dog', 'Cat', 'Rabbit', 'Other')),
  phone TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  time_range TEXT NOT NULL,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('Waiting', 'In-Progress')) DEFAULT 'Waiting',
  checked_in_at TEXT,
  created_by TEXT,
  size TEXT,
  qty INTEGER,
  service_type TEXT
);

CREATE TABLE IF NOT EXISTS session_history (
  id SERIAL PRIMARY KEY,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  time_range TEXT NOT NULL,
  staff_id INTEGER,
  staff_name TEXT,
  checked_in_at TEXT NOT NULL,
  checked_out_at TEXT NOT NULL,
  amount NUMERIC NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (permissive for dev — tighten for production)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_all" ON staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON session_history FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS (atomic transactions)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION checkin_booking(p_booking_id INT, p_staff_id INT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
  v_staff RECORD;
  v_result JSONB;
BEGIN
  SELECT id, pet_name INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT id, busy_with INTO v_staff FROM staff WHERE id = p_staff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff not found';
  END IF;

  IF v_staff.busy_with IS NOT NULL THEN
    RAISE EXCEPTION 'Staff member is already busy';
  END IF;

  UPDATE bookings
  SET status = 'In-Progress', staff_id = p_staff_id, checked_in_at = now()::text
  WHERE id = p_booking_id;

  UPDATE staff
  SET busy_with = v_booking.pet_name
  WHERE id = p_staff_id;

  SELECT jsonb_build_object(
    'id', b.id, 'pet_name', b.pet_name, 'pet_type', b.pet_type,
    'phone', b.phone, 'date', b.date, 'time_range', b.time_range,
    'staff_id', b.staff_id, 'status', b.status
  ) INTO v_result
  FROM bookings b WHERE b.id = p_booking_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION checkout_booking(p_booking_id INT, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking RECORD;
  v_checked_out_at TEXT;
BEGIN
  v_checked_out_at := now()::text;

  SELECT b.id, b.pet_name, b.pet_type, b.phone, b.date, b.time_range,
         b.staff_id, b.checked_in_at, s.name AS staff_name
  INTO v_booking
  FROM bookings b
  LEFT JOIN staff s ON s.id = b.staff_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  INSERT INTO session_history (
    pet_name, pet_type, phone, date, time_range,
    staff_id, staff_name, checked_in_at, checked_out_at, amount
  ) VALUES (
    v_booking.pet_name, v_booking.pet_type, v_booking.phone,
    v_booking.date, v_booking.time_range,
    v_booking.staff_id, v_booking.staff_name,
    COALESCE(v_booking.checked_in_at, v_checked_out_at),
    v_checked_out_at,
    p_amount
  );

  DELETE FROM bookings WHERE id = p_booking_id;

  IF v_booking.staff_id IS NOT NULL THEN
    UPDATE staff SET busy_with = NULL WHERE id = v_booking.staff_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', p_amount);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA (matches server/db.ts seedIfEmpty)
-- ═══════════════════════════════════════════════════════════════════════════

-- Only seed if empty
INSERT INTO staff (id, name, role, busy_with, username, password_hash)
SELECT 1, 'Staff 1', 'Senior Groomer', 'Bella', 'staff1',
       'scrypt:aabbccdd:5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
WHERE NOT EXISTS (SELECT 1 FROM staff);

INSERT INTO staff (id, name, role, busy_with, username, password_hash)
SELECT 2, 'Staff 2', 'Groomer', 'Clover', 'staff2',
       'scrypt:aabbccdd:5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
WHERE NOT EXISTS (SELECT 1 FROM staff WHERE id = 2);

INSERT INTO staff (id, name, role, busy_with, username, password_hash)
SELECT 3, 'Staff 3', 'Groomer Trainee', NULL, 'staff3',
       'scrypt:aabbccdd:5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
WHERE NOT EXISTS (SELECT 1 FROM staff WHERE id = 3);

-- Reset the staff sequence
SELECT setval('staff_id_seq', (SELECT COALESCE(MAX(id), 1) FROM staff));

-- Seed bookings (only if empty)
INSERT INTO bookings (pet_name, pet_type, phone, date, time_range, staff_id, status)
SELECT 'Bella', 'Dog', '081-111-2233', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
       '10:00 AM – 12:00 PM', 1, 'In-Progress'
WHERE NOT EXISTS (SELECT 1 FROM bookings);

INSERT INTO bookings (pet_name, pet_type, phone, date, time_range, staff_id, status)
SELECT 'Mochi', 'Cat', '082-345-6789', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
       '10:00 AM – 12:00 PM', NULL, 'Waiting'
WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE pet_name = 'Mochi');

INSERT INTO bookings (pet_name, pet_type, phone, date, time_range, staff_id, status)
SELECT 'Clover', 'Rabbit', '083-456-7890', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
       '1:00 PM – 3:00 PM', 2, 'In-Progress'
WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE pet_name = 'Clover');

INSERT INTO bookings (pet_name, pet_type, phone, date, time_range, staff_id, status)
SELECT 'Biscuit', 'Dog', '084-567-8901', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
       '2:00 PM – 4:00 PM', NULL, 'Waiting'
WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE pet_name = 'Biscuit');

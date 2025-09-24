-- SDMS Schema for Supabase/PostgreSQL
-- Create extension section (optional) - Supabase allows safe extensions in the project settings
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Classes table
CREATE TABLE IF NOT EXISTS public.classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  total_fees INTEGER NOT NULL DEFAULT 0 CHECK (total_fees >= 0)
);

-- Students table
CREATE TABLE IF NOT EXISTS public.students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  class_id INTEGER REFERENCES public.classes(id) ON DELETE SET NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid >= 0)
);

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount_paid INTEGER NOT NULL CHECK (amount_paid >= 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_method TEXT NOT NULL,
  term TEXT NOT NULL,
  session TEXT NOT NULL,
  note TEXT,
  reference_code TEXT
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date);

COMMIT;

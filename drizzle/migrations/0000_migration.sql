CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_reported_at timestamptz NOT NULL DEFAULT now(),
  ai_department text NOT NULL CHECK (ai_department IN ('Plumbing','Electrical','Wi-Fi','Mess','Academic','Other')),
  department text NOT NULL CHECK (department IN ('Plumbing','Electrical','Wi-Fi','Mess','Academic','Other')),
  block text NOT NULL DEFAULT 'Not specified',
  floor text NOT NULL DEFAULT 'Not specified',
  room text NOT NULL DEFAULT 'Not specified',
  location_key text,
  urgency text NOT NULL CHECK (urgency IN ('High','Medium','Low')),
  confidence integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'routed' CHECK (status IN ('routed','review','approved')),
  latency_ms double precision NOT NULL DEFAULT 0,
  prompt_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd double precision NOT NULL DEFAULT 0,
  cost_inr double precision NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 1 CHECK (report_count >= 1),
  duplicate_texts text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX tickets_dedupe_idx ON public.tickets (department, location_key) WHERE location_key IS NOT NULL;
CREATE INDEX tickets_last_reported_idx ON public.tickets (last_reported_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Shared campus board: no sign-in, everyone sees and manages the same tickets.
CREATE POLICY "Anyone can read tickets" ON public.tickets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can add tickets" ON public.tickets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update tickets" ON public.tickets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete tickets" ON public.tickets FOR DELETE TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
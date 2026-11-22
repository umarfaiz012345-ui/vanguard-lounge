-- ==============================================================================
-- VANGUARD LOUNGE — PRODUCTION SUPABASE POSTGRESQL SCHEMA & RLS POLICIES
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'admin')),
  tier TEXT NOT NULL DEFAULT 'Bronze' CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  points INTEGER NOT NULL DEFAULT 250,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Games Table
CREATE TABLE IF NOT EXISTS public.games (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status_tag TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  play_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  image_path TEXT NOT NULL,
  active_players INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Service Categories
CREATE TABLE IF NOT EXISTS public.service_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sla_minutes INTEGER NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Promotions Table
CREATE TABLE IF NOT EXISTS public.promotions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  bonus_label TEXT NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. External Payment Methods Table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id TEXT PRIMARY KEY,
  method_type TEXT NOT NULL CHECK (method_type IN ('cash_app', 'venmo', 'zelle', 'cryptocurrency', 'bank_transfer', 'wire', 'other')),
  label TEXT NOT NULL,
  instructions TEXT NOT NULL,
  account_or_address TEXT NOT NULL,
  network_or_routing TEXT NOT NULL,
  external_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payment Submissions Table (Manual verification model)
CREATE TABLE IF NOT EXISTS public.payment_submissions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  method_id TEXT NOT NULL REFERENCES public.payment_methods(id),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  receipt_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  player_notes TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Live Chat Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES public.service_categories(id),
  game_id TEXT REFERENCES public.games(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  assigned_staff_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Chat Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'staff', 'admin', 'bot')),
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  game_link_payload JSONB,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_tab TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES FOR HIGH-PERFORMANCE QUERIES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_user ON public.payment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON public.payment_submissions(status);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin/staff
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_staff_or_admin());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Public Read Catalog Policies
CREATE POLICY "Anyone can view enabled games" ON public.games
  FOR SELECT USING (is_enabled = TRUE OR public.is_staff_or_admin());

CREATE POLICY "Anyone can view active categories" ON public.service_categories
  FOR SELECT USING (is_active = TRUE OR public.is_staff_or_admin());

CREATE POLICY "Anyone can view active promotions" ON public.promotions
  FOR SELECT USING (is_active = TRUE OR public.is_staff_or_admin());

CREATE POLICY "Anyone can view active payment methods" ON public.payment_methods
  FOR SELECT USING (is_active = TRUE OR public.is_staff_or_admin());

-- Payment Submissions Policies (Manual verification desk)
CREATE POLICY "Players can view their own submissions" ON public.payment_submissions
  FOR SELECT USING (auth.uid() = user_id OR public.is_staff_or_admin());

CREATE POLICY "Players can insert payment submissions" ON public.payment_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Only staff/admin can update payment submissions" ON public.payment_submissions
  FOR UPDATE USING (public.is_staff_or_admin());

-- Conversations Policies
CREATE POLICY "Players can view their own conversations" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id OR public.is_staff_or_admin());

CREATE POLICY "Players can create their own conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players and staff can update their conversations" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id OR public.is_staff_or_admin());

-- Messages Policies
CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user_id = auth.uid() OR public.is_staff_or_admin())
    )
  );

CREATE POLICY "Users can insert messages in their conversations" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user_id = auth.uid() OR public.is_staff_or_admin())
    )
  );

-- Notifications Policies
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Storage bucket for receipt screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload receipts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.role() = 'authenticated');

CREATE POLICY "Public read for receipts" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts');

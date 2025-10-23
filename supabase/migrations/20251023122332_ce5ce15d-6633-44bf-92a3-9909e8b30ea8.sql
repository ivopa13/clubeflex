-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'specifier', 'customer');

-- Create specifier_role enum
CREATE TYPE public.specifier_role AS ENUM ('pedreiro', 'pintor', 'eletricista', 'encanador', 'arquiteto');

-- Create invoice_status enum
CREATE TYPE public.invoice_status AS ENUM ('created', 'partially_paid', 'paid', 'canceled');

-- Create redemption_status enum
CREATE TYPE public.redemption_status AS ENUM ('requested', 'approved', 'rejected', 'fulfilled', 'canceled');

-- Create ledger_type enum
CREATE TYPE public.ledger_type AS ENUM ('pending_add', 'pending_sub', 'released_add', 'released_sub', 'redeem', 'refund');

-- Create actor_type enum
CREATE TYPE public.actor_type AS ENUM ('customer', 'specifier');

-- Create webhook_source enum
CREATE TYPE public.webhook_source AS ENUM ('invoice_created', 'payment_confirmed', 'refund', 'cancel');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create program_settings table (singleton)
CREATE TABLE public.program_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  earn_rate_customer DECIMAL(6,2) DEFAULT 1.00 NOT NULL,
  earn_rate_specifier DECIMAL(6,2) DEFAULT 1.00 NOT NULL,
  allow_copay BOOLEAN DEFAULT FALSE NOT NULL,
  points_expiration_days INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.program_settings (earn_rate_customer, earn_rate_specifier, allow_copay) 
VALUES (1.00, 1.00, FALSE);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id_ext TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  doc TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create specifiers table
CREATE TABLE public.specifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  specifier_id_ext TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role specifier_role NOT NULL,
  doc TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id_ext TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  specifier_id UUID REFERENCES public.specifiers(id),
  total_amount DECIMAL(14,2) NOT NULL CHECK (total_amount > 0),
  pending_points_customer DECIMAL(14,2) DEFAULT 0 NOT NULL,
  released_points_customer DECIMAL(14,2) DEFAULT 0 NOT NULL,
  pending_points_specifier DECIMAL(14,2) DEFAULT 0 NOT NULL,
  released_points_specifier DECIMAL(14,2) DEFAULT 0 NOT NULL,
  status invoice_status DEFAULT 'created' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_event_id TEXT UNIQUE NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id) NOT NULL,
  paid_amount DECIMAL(14,2) NOT NULL CHECK (paid_amount > 0),
  paid_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create points_ledger table
CREATE TABLE public.points_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type actor_type NOT NULL,
  actor_id_customer UUID REFERENCES public.customers(id),
  actor_id_specifier UUID REFERENCES public.specifiers(id),
  invoice_id UUID REFERENCES public.invoices(id),
  type ledger_type NOT NULL,
  points DECIMAL(14,2) NOT NULL,
  ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create catalog_products table
CREATE TABLE public.catalog_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  points_price DECIMAL(14,2) NOT NULL CHECK (points_price >= 0),
  cash_copay DECIMAL(14,2) DEFAULT 0 CHECK (cash_copay >= 0),
  stock_qty INTEGER DEFAULT 0 NOT NULL,
  track_inventory BOOLEAN DEFAULT TRUE NOT NULL,
  category TEXT,
  image_urls JSONB,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create redemptions table
CREATE TABLE public.redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type actor_type NOT NULL,
  actor_id_customer UUID REFERENCES public.customers(id),
  actor_id_specifier UUID REFERENCES public.specifiers(id),
  status redemption_status DEFAULT 'requested' NOT NULL,
  total_points DECIMAL(14,2) DEFAULT 0 NOT NULL,
  copay_total DECIMAL(14,2) DEFAULT 0 NOT NULL,
  shipping_info JSONB,
  pickup_store TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create redemption_items table
CREATE TABLE public.redemption_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  redemption_id UUID REFERENCES public.redemptions(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.catalog_products(id) NOT NULL,
  qty INTEGER DEFAULT 1 NOT NULL CHECK (qty > 0),
  points_price DECIMAL(14,2) NOT NULL,
  copay_price DECIMAL(14,2) DEFAULT 0 NOT NULL,
  subtotal_points DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create webhook_events table
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT UNIQUE NOT NULL,
  source webhook_source NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to get customer_id from user_id
CREATE OR REPLACE FUNCTION public.get_customer_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.customers WHERE user_id = _user_id LIMIT 1
$$;

-- Create function to get specifier_id from user_id
CREATE OR REPLACE FUNCTION public.get_specifier_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.specifiers WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for program_settings
CREATE POLICY "Everyone can view program settings"
  ON public.program_settings FOR SELECT
  USING (TRUE);

CREATE POLICY "Only admins can update program settings"
  ON public.program_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for customers
CREATE POLICY "Admins can view all customers"
  ON public.customers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can view their own data"
  ON public.customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage customers"
  ON public.customers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for specifiers
CREATE POLICY "Admins can view all specifiers"
  ON public.specifiers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Specifiers can view their own data"
  ON public.specifiers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage specifiers"
  ON public.specifiers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for invoices
CREATE POLICY "Admins can view all invoices"
  ON public.invoices FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can view their own invoices"
  ON public.invoices FOR SELECT
  USING (customer_id = public.get_customer_id(auth.uid()));

CREATE POLICY "Specifiers can view invoices they're linked to"
  ON public.invoices FOR SELECT
  USING (specifier_id = public.get_specifier_id(auth.uid()));

-- RLS Policies for points_ledger
CREATE POLICY "Admins can view all ledger entries"
  ON public.points_ledger FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can view their own ledger"
  ON public.points_ledger FOR SELECT
  USING (
    actor_type = 'customer' AND 
    actor_id_customer = public.get_customer_id(auth.uid())
  );

CREATE POLICY "Specifiers can view their own ledger"
  ON public.points_ledger FOR SELECT
  USING (
    actor_type = 'specifier' AND 
    actor_id_specifier = public.get_specifier_id(auth.uid())
  );

-- RLS Policies for catalog_products
CREATE POLICY "Everyone can view active products"
  ON public.catalog_products FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Admins can manage products"
  ON public.catalog_products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for redemptions
CREATE POLICY "Admins can view all redemptions"
  ON public.redemptions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can view their own redemptions"
  ON public.redemptions FOR SELECT
  USING (
    actor_type = 'customer' AND 
    actor_id_customer = public.get_customer_id(auth.uid())
  );

CREATE POLICY "Specifiers can view their own redemptions"
  ON public.redemptions FOR SELECT
  USING (
    actor_type = 'specifier' AND 
    actor_id_specifier = public.get_specifier_id(auth.uid())
  );

CREATE POLICY "Users can create redemptions"
  ON public.redemptions FOR INSERT
  WITH CHECK (
    (actor_type = 'customer' AND actor_id_customer = public.get_customer_id(auth.uid())) OR
    (actor_type = 'specifier' AND actor_id_specifier = public.get_specifier_id(auth.uid()))
  );

CREATE POLICY "Admins can update redemptions"
  ON public.redemptions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for redemption_items
CREATE POLICY "Users can view their redemption items"
  ON public.redemption_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.id = redemption_items.redemption_id
      AND (
        (r.actor_type = 'customer' AND r.actor_id_customer = public.get_customer_id(auth.uid())) OR
        (r.actor_type = 'specifier' AND r.actor_id_specifier = public.get_specifier_id(auth.uid())) OR
        public.has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can insert redemption items"
  ON public.redemption_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.id = redemption_items.redemption_id
      AND (
        (r.actor_type = 'customer' AND r.actor_id_customer = public.get_customer_id(auth.uid())) OR
        (r.actor_type = 'specifier' AND r.actor_id_specifier = public.get_specifier_id(auth.uid()))
      )
    )
  );

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_catalog_products_updated_at BEFORE UPDATE ON public.catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_redemptions_updated_at BEFORE UPDATE ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger function for new user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for performance
CREATE INDEX idx_customers_ext_id ON public.customers(customer_id_ext);
CREATE INDEX idx_customers_user_id ON public.customers(user_id);
CREATE INDEX idx_specifiers_ext_id ON public.specifiers(specifier_id_ext);
CREATE INDEX idx_specifiers_user_id ON public.specifiers(user_id);
CREATE INDEX idx_invoices_ext_id ON public.invoices(invoice_id_ext);
CREATE INDEX idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX idx_invoices_specifier_id ON public.invoices(specifier_id);
CREATE INDEX idx_payments_event_id ON public.payments(payment_event_id);
CREATE INDEX idx_ledger_actor_customer ON public.points_ledger(actor_id_customer) WHERE actor_type = 'customer';
CREATE INDEX idx_ledger_actor_specifier ON public.points_ledger(actor_id_specifier) WHERE actor_type = 'specifier';
CREATE INDEX idx_webhook_event_id ON public.webhook_events(event_id);
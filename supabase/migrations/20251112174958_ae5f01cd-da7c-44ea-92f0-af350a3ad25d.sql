-- Fix RLS to allow profile upserts by admins (and optionally by the user themselves)

-- Create policy: Admins can INSERT profiles
CREATE POLICY "Admins can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create policy: Users can INSERT their own profile (covers missing rows created before automation)
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);
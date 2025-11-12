-- Ensure customers and specifiers have proper RLS policies for SELECT and UPDATE on their own rows

-- CUSTOMERS table: SELECT policy for own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'customers' 
      AND policyname = 'Customers can view their own data'
  ) THEN
    CREATE POLICY "Customers can view their own data"
    ON public.customers
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- CUSTOMERS table: UPDATE policy for own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'customers' 
      AND policyname = 'Customers can update their own data'
  ) THEN
    CREATE POLICY "Customers can update their own data"
    ON public.customers
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- SPECIFIERS table: SELECT policy for own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'specifiers' 
      AND policyname = 'Specifiers can view their own data'
  ) THEN
    CREATE POLICY "Specifiers can view their own data"
    ON public.specifiers
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- SPECIFIERS table: UPDATE policy for own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'specifiers' 
      AND policyname = 'Specifiers can update their own data'
  ) THEN
    CREATE POLICY "Specifiers can update their own data"
    ON public.specifiers
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

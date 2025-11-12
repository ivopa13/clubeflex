-- Permitir customers atualizarem seus próprios dados
CREATE POLICY "Customers can update their own data"
ON public.customers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Permitir specifiers atualizarem seus próprios dados
CREATE POLICY "Specifiers can update their own data"
ON public.specifiers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
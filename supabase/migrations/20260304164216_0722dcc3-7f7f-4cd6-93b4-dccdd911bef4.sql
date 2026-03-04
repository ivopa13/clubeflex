-- Allow the integrator (anon key) to read sync_logs for checksum comparison
CREATE POLICY "Allow anon to read sync logs"
ON public.sync_logs
FOR SELECT
TO anon
USING (true);

-- Allow the integrator (anon key) to read integrator_executions
CREATE POLICY "Allow anon to read integrator executions"
ON public.integrator_executions
FOR SELECT
TO anon
USING (true);
ALTER TABLE public.integrator_executions ADD COLUMN project_name text DEFAULT 'ClubeFlex';

UPDATE public.integrator_executions 
SET project_name = split_part(execution_id, '_', 2)
WHERE execution_id LIKE 'EXEC_%';
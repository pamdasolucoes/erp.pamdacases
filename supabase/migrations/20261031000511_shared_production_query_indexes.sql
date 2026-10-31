CREATE INDEX erp_production_task_events_timeline ON public.erp_production_task_events(task_id,created_at);
CREATE INDEX erp_production_tasks_retry ON public.erp_production_tasks(retry_of) WHERE retry_of IS NOT NULL;
CREATE INDEX erp_production_tasks_external ON public.erp_production_tasks(channel_id,lower(external_order)) WHERE stage<>'cancelled';
CREATE INDEX erp_production_tasks_history ON public.erp_production_tasks(updated_at DESC) WHERE stage IN ('packed','cancelled');

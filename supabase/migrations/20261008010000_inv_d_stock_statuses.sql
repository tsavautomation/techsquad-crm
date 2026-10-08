-- INV-d "Estoque em Campo" (SPEC §9.1, Fred 2026-10-08): the serial-centric stock screens need two more
-- stages for a unit: Separated (picked at the warehouse for a client, not yet installed) and Discarded
-- (written off). Same tables, same permissions; only the Stock Status workflow gains the two stages.
insert into public.workflow_levels (workflow_id, place, title, color, field_updates)
select 'stock_status', v.p, v.t, v.c, jsonb_build_array(jsonb_build_object('field', 'status', 'value', v.t))
from (values (4, 'Separated', '#ff9800'), (5, 'Discarded', '#9e9e9e')) as v(p, t, c)
where not exists (select 1 from public.workflow_levels l where l.workflow_id = 'stock_status' and l.title = v.t);

-- Who may act is per person since P1 (permission key workflow.stock_status.act): nothing to add per level.

-- Outcomes the Workflow panel offers: In Stock → Separated, Separated → On Project / In Stock, RMA → In Stock.
insert into public.workflow_outcomes (level_id, place, title, kind, target_level_id)
select f.id, o.op, o.title, 'goto', t.id
from (values ('In Stock', 2, 'Separated', 'Separated'), ('Separated', 1, 'On Project', 'On Project'), ('Separated', 2, 'In Stock', 'In Stock'), ('RMA', 1, 'In Stock', 'In Stock')) as o(ft, op, title, tt)
join public.workflow_levels f on f.workflow_id = 'stock_status' and f.title = o.ft
join public.workflow_levels t on t.workflow_id = 'stock_status' and t.title = o.tt
where not exists (select 1 from public.workflow_outcomes x where x.level_id = f.id and x.title = o.title);

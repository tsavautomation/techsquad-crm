-- F4 Pipeline, contact log and messages (docs/portal-features-merge.md §F, G, H, L; SPEC §9.1 F4-a…d).
--   projects.salesperson_id          who sells the project; gets the stage auto tasks
--   contact_interactions.project_id  a call / text / email can be about a project (project timeline)
--   contact_interactions.notes       what was said; a template send stores the message here
--   contact_interactions.template    which message template was sent (review requests on Today)
--   tasks.source                     which automation made the task (no duplicate open tasks)
--   app_settings 'messages'          message templates in English / Português / Español + review link
--   automations 900401–900403        auto tasks when a project enters Proposal Sent / Approved / Complete
--   public.workflow_board()          stages, their options and whether I may move cards out of each

alter table public.projects add column salesperson_id bigint references public.employees (id) on delete set null;
create index on public.projects (salesperson_id);
comment on column public.projects.salesperson_id is 'Salesperson (F4, not in WebAuthor)';

alter table public.contact_interactions
  add column project_id bigint references public.projects (id) on delete set null,
  add column notes text,
  add column template text;
create index on public.contact_interactions (project_id);
create index on public.contact_interactions (follow_up_date) where follow_up_date is not null and deleted_at is null;
comment on column public.contact_interactions.project_id is 'Project (F4)';
comment on column public.contact_interactions.notes is 'Notes (F4)';
comment on column public.contact_interactions.template is 'Message template sent (F4)';

alter table public.tasks add column source text;
create index on public.tasks (source) where source is not null;

-- ---------------------------------------------------------------- message templates
insert into public.app_settings (key, value) values ('messages', $json${
  "review_link": "",
  "templates": [
    {
      "key": "first_contact", "name": "First contact", "active": true,
      "texts": {
        "en": { "subject": "Tech Squad – {project}", "body": "Hi {first_name}, this is {sender} from Tech Squad. Thanks for reaching out about {project}. When is a good time for a quick call to go over what you need?" },
        "pt": { "subject": "Tech Squad – {project}", "body": "Olá {first_name}, aqui é {sender} da Tech Squad. Obrigado pelo contato sobre {project}. Qual o melhor horário para uma ligação rápida para entendermos o que você precisa?" },
        "es": { "subject": "Tech Squad – {project}", "body": "Hola {first_name}, soy {sender} de Tech Squad. Gracias por contactarnos sobre {project}. ¿Cuándo es un buen momento para una llamada rápida y ver lo que necesita?" }
      }
    },
    {
      "key": "visit_confirmation", "name": "Visit confirmation", "active": true,
      "texts": {
        "en": { "subject": "Visit confirmation – {visit_date}", "body": "Hi {first_name}, this is {sender} from Tech Squad confirming our visit to {address} on {visit_date} at {visit_time}. Please reply to confirm, or let us know if you need to change it." },
        "pt": { "subject": "Confirmação de visita – {visit_date}", "body": "Olá {first_name}, aqui é {sender} da Tech Squad, confirmando nossa visita em {address} no dia {visit_date} às {visit_time}. Responda para confirmar ou nos avise se precisar mudar." },
        "es": { "subject": "Confirmación de visita – {visit_date}", "body": "Hola {first_name}, soy {sender} de Tech Squad, confirmando nuestra visita a {address} el {visit_date} a las {visit_time}. Responda para confirmar o avísenos si necesita cambiarla." }
      }
    },
    {
      "key": "proposal_follow_up", "name": "Proposal follow-up", "active": true,
      "texts": {
        "en": { "subject": "Your proposal – {project}", "body": "Hi {first_name}, this is {sender} from Tech Squad. I wanted to follow up on the proposal we sent for {project}. Do you have any questions, or would you like to go over it together?" },
        "pt": { "subject": "Sua proposta – {project}", "body": "Olá {first_name}, aqui é {sender} da Tech Squad. Queria saber se você recebeu a proposta que enviamos para {project}. Tem alguma dúvida ou prefere revisarmos juntos?" },
        "es": { "subject": "Su propuesta – {project}", "body": "Hola {first_name}, soy {sender} de Tech Squad. Quería dar seguimiento a la propuesta que enviamos para {project}. ¿Tiene alguna pregunta o le gustaría revisarla juntos?" }
      }
    },
    {
      "key": "review_request", "name": "Review request", "active": true,
      "texts": {
        "en": { "subject": "Thank you from Tech Squad", "body": "Hi {first_name}, thank you for choosing Tech Squad for {project}! If you're happy with our work, a quick review would mean a lot to our team: {review_link}" },
        "pt": { "subject": "Obrigado da Tech Squad", "body": "Olá {first_name}, obrigado por escolher a Tech Squad para {project}! Se você ficou satisfeito com o nosso trabalho, uma avaliação rápida significaria muito para a nossa equipe: {review_link}" },
        "es": { "subject": "Gracias de parte de Tech Squad", "body": "Hola {first_name}, ¡gracias por elegir a Tech Squad para {project}! Si quedó contento con nuestro trabajo, una reseña rápida significaría mucho para nuestro equipo: {review_link}" }
      }
    },
    {
      "key": "plan_renewal", "name": "Maintenance plan renewal", "active": true,
      "texts": {
        "en": { "subject": "Your maintenance plan – {project}", "body": "Hi {first_name}, this is {sender} from Tech Squad. Your {plan} maintenance plan for {project} is up for renewal. Would you like us to renew it so your system stays covered?" },
        "pt": { "subject": "Seu plano de manutenção – {project}", "body": "Olá {first_name}, aqui é {sender} da Tech Squad. Seu plano de manutenção {plan} de {project} está para renovar. Quer que renovemos para o seu sistema continuar coberto?" },
        "es": { "subject": "Su plan de mantenimiento – {project}", "body": "Hola {first_name}, soy {sender} de Tech Squad. Su plan de mantenimiento {plan} para {project} está por renovarse. ¿Desea que lo renovemos para que su sistema siga cubierto?" }
      }
    }
  ]
}$json$::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- stage auto tasks
-- Workflow stage changes write Job Status with the mover as actor, so "field:job_status" fires.
-- The task goes to the project's Salesperson, or to whoever moved the stage when it's blank.
insert into public.automations (id, table_name, title, active, events, conditions, actions, notes) values
(900401, 'projects', 'Follow up after the proposal is sent', true, '{field:job_status}',
  '{"match":"all","rules":[{"field":"job_status","op":"=","value":"Proposal Sent"}]}',
  '[{"type":"task","text":"Follow up on the proposal: {title}","due_days":3,"assign":"salesperson_id","labels":["Client"]}]',
  'F4: a task 3 days after the proposal goes out.'),
(900402, 'projects', 'Schedule the start after approval', true, '{field:job_status}',
  '{"match":"all","rules":[{"field":"job_status","op":"=","value":"Proposal Approved"}]}',
  '[{"type":"task","text":"Proposal approved: schedule the start of {title}","due_days":1,"assign":"salesperson_id","labels":["Client"]}]',
  'F4: book the first visit once the client says yes.'),
(900403, 'projects', 'Ask for a review and offer a maintenance plan', true, '{field:job_status}',
  '{"match":"all","rules":[{"field":"job_status","op":"=","value":"Complete"}]}',
  '[{"type":"task","text":"Project complete: ask {job_owner_id} for a review and offer a maintenance plan ({title})","due_days":2,"assign":"salesperson_id","labels":["Client"]}]',
  'F4: the review request itself is sent from the project (Message the client).');

-- ---------------------------------------------------------------- pipeline board
/**
 * The pipeline board's columns for a table's active workflow: every level in order, its options,
 * and whether the current user may move records out of it (same test as workflow_move).
 */
create function public.workflow_board(p_table text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'workflow', w.id,
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'title', l.title, 'color', l.color, 'place', l.place, 'is_start', l.is_start,
        'may_act', app.may_act_on_level(l.id),
        'outcomes', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'target', o.target_level_id) order by o.place)
          from public.workflow_outcomes o where o.level_id = l.id), '[]')
      ) order by l.place)
      from public.workflow_levels l where l.workflow_id = w.id), '[]')
  )
  from public.workflows w
  where w.table_name = p_table and w.active
  limit 1;
$$;
revoke execute on function public.workflow_board(text) from public, anon;
grant execute on function public.workflow_board(text) to authenticated;

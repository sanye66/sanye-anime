create sequence if not exists sanye_ai_chat.sanye_ai_usage_id_seq;
alter table sanye_ai_usage alter column id set default nextval('sanye_ai_chat.sanye_ai_usage_id_seq');
select setval(
    'sanye_ai_chat.sanye_ai_usage_id_seq',
    coalesce((select max(id) from sanye_ai_usage), 1),
    (select max(id) is not null from sanye_ai_usage)
);
create index if not exists idx_sanye_ai_usage_created_at on sanye_ai_usage (created_at desc);
create index if not exists idx_sanye_ai_usage_message_id on sanye_ai_usage (message_id);

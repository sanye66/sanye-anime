alter table sanye_conversation add column if not exists owner_key varchar(64) not null default '';
alter table sanye_conversation alter column user_id drop not null;

create sequence if not exists sanye_ai_chat.sanye_conversation_id_seq;
alter table sanye_conversation alter column id set default nextval('sanye_ai_chat.sanye_conversation_id_seq');

create sequence if not exists sanye_ai_chat.sanye_conversation_message_id_seq;
alter table sanye_conversation_message alter column id set default nextval('sanye_ai_chat.sanye_conversation_message_id_seq');

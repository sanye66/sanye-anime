create sequence if not exists sanye_anime.sanye_event_outbox_seq;
alter table sanye_event_outbox alter column id set default nextval('sanye_anime.sanye_event_outbox_seq');
select setval('sanye_anime.sanye_event_outbox_seq', coalesce((select max(id) from sanye_event_outbox), 0) + 1, false);

create sequence if not exists sanye_anime_event_outbox_id_seq;
select setval('sanye_anime_event_outbox_id_seq', greatest(coalesce((select max(id) from sanye_anime.sanye_event_outbox), 0), 1), true);
alter table sanye_anime.sanye_event_outbox
    alter column id set default nextval('sanye_anime_event_outbox_id_seq');
alter sequence sanye_anime_event_outbox_id_seq owned by sanye_anime.sanye_event_outbox.id;

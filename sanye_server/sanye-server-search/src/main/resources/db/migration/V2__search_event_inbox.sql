create table if not exists sanye_search_event_inbox (
    aggregate_id bigint primary key,
    version bigint not null,
    event_id varchar(128) not null,
    processed_at timestamptz not null default now()
);

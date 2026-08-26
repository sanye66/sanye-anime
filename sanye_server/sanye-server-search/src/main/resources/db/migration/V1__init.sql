create table if not exists sanye_search_sync_record (
    id         bigint primary key,
    anime_id   bigint      not null,
    status     varchar(16) not null default 'PENDING',
    synced_at  timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists idx_sanye_search_sync_status on sanye_search_sync_record (status);

create table if not exists sanye_event_outbox (
    id            bigint primary key,
    event_id      varchar(64) not null unique,
    event_type    varchar(64) not null,
    aggregate_id  bigint      not null,
    payload       jsonb       not null,
    status        varchar(16) not null default 'PENDING',
    retry_count   int         not null default 0,
    next_retry_at timestamptz,
    created_at    timestamptz not null default now(),
    published_at  timestamptz
);

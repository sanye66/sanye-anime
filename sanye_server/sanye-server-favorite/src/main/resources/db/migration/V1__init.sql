create table if not exists sanye_user_favorite (
    user_id    bigint      not null,
    anime_id   bigint      not null,
    created_at timestamptz not null default now(),
    primary key (user_id, anime_id)
);

create table if not exists sanye_user_watch_history (
    id           bigint primary key,
    user_id      bigint      not null,
    anime_id     bigint      not null,
    last_view_at timestamptz not null default now(),
    unique (user_id, anime_id)
);

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

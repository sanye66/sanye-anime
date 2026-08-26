create table if not exists sanye_anime (
    id              bigint primary key,
    title           varchar(120) not null,
    original_title  varchar(120),
    type            varchar(20)  not null,
    year            int,
    summary         text,
    cover_file_id   bigint,
    status          varchar(16)  not null default 'DRAFT',
    source          varchar(255),
    license_note    varchar(500),
    version         bigint       not null default 0,
    published_at    timestamptz,
    created_at      timestamptz  not null default now(),
    updated_at      timestamptz  not null default now(),
    deleted_at      timestamptz
);
create index if not exists idx_sanye_anime_status on sanye_anime (status, published_at desc);

create table if not exists sanye_anime_alias (
    id       bigint primary key,
    anime_id bigint       not null,
    alias    varchar(120) not null,
    unique (anime_id, alias)
);

create table if not exists sanye_anime_tag (
    anime_id bigint      not null,
    tag      varchar(32) not null,
    primary key (anime_id, tag)
);

create table if not exists sanye_anime_schedule (
    id          bigint primary key,
    anime_id    bigint      not null,
    episode_no  int         not null,
    air_date    date        not null,
    air_time    time,
    status      varchar(16) not null default 'PLANNED',
    external_id varchar(64),
    unique (anime_id, episode_no),
    unique (external_id)
);

create table if not exists sanye_anime_banner (
    id       bigint primary key,
    anime_id bigint      not null,
    position int         not null,
    status   varchar(16) not null default 'DRAFT',
    start_at timestamptz,
    end_at   timestamptz
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

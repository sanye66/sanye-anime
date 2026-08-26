create table if not exists sanye_user_account (
    id            bigint primary key,
    username      varchar(64)  not null unique,
    password_hash varchar(100),
    nickname      varchar(50),
    status        varchar(16)  not null default 'ACTIVE',
    created_at    timestamptz  not null default now(),
    updated_at    timestamptz  not null default now(),
    deleted_at    timestamptz
);

create table if not exists sanye_user_auth (
    id               bigint primary key,
    user_id          bigint       not null,
    auth_type        varchar(16)  not null,
    cas_user_id      varchar(128),
    credential       varchar(100),
    refresh_token_id varchar(64),
    created_at       timestamptz  not null default now(),
    unique (auth_type, cas_user_id)
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

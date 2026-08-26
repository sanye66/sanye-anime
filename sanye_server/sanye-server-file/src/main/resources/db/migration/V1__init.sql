create table if not exists sanye_file_object (
    id            bigint primary key,
    bucket        varchar(64)  not null,
    object_key    varchar(255) not null unique,
    original_name varchar(255),
    content_type  varchar(100),
    size_bytes    bigint,
    sha256        varchar(64),
    scan_status   varchar(16)  not null default 'PENDING',
    owner_user_id bigint,
    status        varchar(16)  not null default 'ACTIVE',
    created_at    timestamptz  not null default now(),
    unique (bucket, object_key)
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

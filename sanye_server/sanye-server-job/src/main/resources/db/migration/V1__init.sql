create table if not exists sanye_job_record (
    id         bigint primary key,
    job_name   varchar(120) not null,
    job_key    varchar(120) not null,
    run_at     timestamptz  not null default now(),
    status     varchar(16)  not null default 'RUNNING',
    detail     text,
    created_at timestamptz  not null default now()
);
create index if not exists idx_sanye_job_record_status on sanye_job_record (status, run_at desc);

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

create table if not exists sanye_feedback (
    id         bigint primary key,
    user_id    bigint,
    type       varchar(20) not null,
    content    text        not null,
    ref_type   varchar(20),
    ref_id     bigint,
    status     varchar(16) not null default 'OPEN',
    priority   varchar(8)  not null default 'NORMAL',
    closed_at  timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists sanye_feedback_handle_log (
    id          bigint primary key,
    feedback_id bigint       not null,
    operator_id bigint,
    action      varchar(32)  not null,
    note        varchar(500),
    created_at  timestamptz  not null default now()
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

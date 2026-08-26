create table if not exists sanye_conversation (
    id                bigint primary key,
    user_id           bigint      not null,
    title             varchar(50),
    status            varchar(16) not null default 'ACTIVE',
    context_anime_id  bigint,
    spoiler_mode      varchar(8)  not null default 'SAFE',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists idx_sanye_conversation_user on sanye_conversation (user_id, updated_at desc);

create table if not exists sanye_conversation_message (
    id                bigint primary key,
    conversation_id   bigint       not null,
    client_message_id varchar(64)  not null,
    role              varchar(8)   not null,
    content           text         not null,
    status            varchar(16)  not null default 'PENDING',
    model             varchar(64),
    generate_try      int          not null default 1,
    recommend_json    jsonb,
    created_at        timestamptz  not null default now(),
    unique (conversation_id, client_message_id)
);
create index if not exists idx_sanye_message_conv on sanye_conversation_message (conversation_id, id);

create table if not exists sanye_ai_quota_log (
    id         bigint primary key,
    user_id    bigint,
    device_id  varchar(64),
    quota_date date        not null,
    action     varchar(16) not null,
    amount     int         not null,
    request_id varchar(64) not null unique,
    created_at timestamptz not null default now()
);

create table if not exists sanye_ai_usage (
    id                 bigint primary key,
    message_id         bigint,
    model              varchar(64),
    prompt_tokens      int,
    completion_tokens  int,
    latency_ms         int,
    cost_cents         int,
    created_at         timestamptz not null default now()
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

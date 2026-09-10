alter table if exists sanye_event_outbox
    alter column aggregate_id type bigint using aggregate_id::bigint,
    add column if not exists aggregate_version bigint not null default 1,
    add column if not exists occurred_at timestamptz not null default now(),
    add column if not exists attempts int not null default 0,
    add column if not exists next_retry_at timestamptz not null default now(),
    add column if not exists sent_at timestamptz,
    add column if not exists last_error text;
create index if not exists idx_sanye_event_outbox_pending
    on sanye_event_outbox(status, next_retry_at, occurred_at);

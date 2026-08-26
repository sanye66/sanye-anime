create table if not exists sanye_ai_chat_memory (
    id         bigserial primary key,
    memory_id  bigint       not null,
    role       varchar(8)   not null,
    content    text         not null,
    created_at timestamptz  not null default now()
);
create index if not exists idx_sanye_ai_chat_memory on sanye_ai_chat_memory (memory_id, id);

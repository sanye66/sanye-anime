create table if not exists sanye_ai_preference (
    owner_key      varchar(128)  primary key,
    temperature    double precision,
    context_length integer,
    model_name     varchar(50),
    updated_at     timestamptz   not null default now()
);

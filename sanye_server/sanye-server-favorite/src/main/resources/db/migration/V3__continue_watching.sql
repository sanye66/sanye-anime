create table if not exists sanye_user_continue_watching (
    owner_key        varchar(64) not null,
    anime_id         bigint not null,
    episode_id       bigint not null,
    episode_title    varchar(255),
    position_seconds bigint not null default 0,
    duration_seconds bigint not null default 0,
    completed        boolean not null default false,
    updated_at       timestamptz not null default now(),
    primary key (owner_key, anime_id, episode_id),
    check (anime_id > 0),
    check (episode_id > 0),
    check (position_seconds >= 0),
    check (duration_seconds >= 0)
);

create index if not exists idx_user_continue_watching_updated
    on sanye_user_continue_watching (owner_key, updated_at desc);

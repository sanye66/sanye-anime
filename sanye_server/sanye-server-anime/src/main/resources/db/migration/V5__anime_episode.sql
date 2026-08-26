-- 公开媒体元数据：只存来源页和外部播放器地址，不存储视频二进制。
create table if not exists sanye_anime_episode (
    id              bigserial primary key,
    anime_id        bigint       not null references sanye_anime(id),
    episode_no      int          not null,
    title           varchar(255) not null,
    source_page_url varchar(2048) not null,
    playback_url    varchar(2048) not null,
    mime_type       varchar(100) not null default 'text/html',
    source_label    varchar(100),
    created_at      timestamptz   not null default now(),
    updated_at      timestamptz   not null default now(),
    unique (anime_id, episode_no),
    unique (anime_id, source_page_url)
);

create index if not exists idx_sanye_anime_episode_anime
    on sanye_anime_episode (anime_id, episode_no);

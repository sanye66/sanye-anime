-- 保留导入时解析到的主线路与备用线路，避免 PostgreSQL 往返后丢失故障切线能力。
alter table sanye_anime_episode
    add column if not exists playback_options_json jsonb not null default '[]'::jsonb;

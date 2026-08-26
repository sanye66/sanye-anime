-- 设备级收藏过渡（T-F-02）：owner_key = device:xxx 或 user:xxx，CAS 接入后迁移到用户维度
alter table sanye_user_favorite add column if not exists owner_key varchar(64) not null default '';
alter table sanye_user_favorite drop constraint if exists sanye_user_favorite_pkey;
alter table sanye_user_favorite alter column user_id drop not null;
alter table sanye_user_favorite add primary key (owner_key, anime_id);

alter table sanye_user_watch_history add column if not exists owner_key varchar(64) not null default '';
alter table sanye_user_watch_history drop constraint if exists sanye_user_watch_history_user_id_anime_id_key;
alter table sanye_user_watch_history alter column user_id drop not null;
alter table sanye_user_watch_history add constraint sanye_user_watch_history_owner_key_anime_id_key unique (owner_key, anime_id);
create sequence if not exists sanye_favorite.sanye_user_watch_history_id_seq;
alter table sanye_user_watch_history alter column id set default nextval('sanye_favorite.sanye_user_watch_history_id_seq');

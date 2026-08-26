-- 导入幂等判断按来源和标题单条查询，避免作品数量增长后退化为全表扫描。
create index if not exists idx_sanye_anime_source_active
    on sanye_anime (source) where deleted_at is null and source is not null;

create index if not exists idx_sanye_anime_title_active
    on sanye_anime (title) where deleted_at is null;

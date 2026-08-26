-- 清理历史演示目录和冒烟/E2E 生成的作品，只保留当前正式片库。
-- 该迁移只执行一次；后续通过管理端导入的新正式作品不会被自动删除。
delete from sanye_anime.sanye_anime_alias
 where anime_id not in (127, 128, 133, 135, 136, 137);

delete from sanye_anime.sanye_anime_banner
 where anime_id not in (127, 128, 133, 135, 136, 137);

delete from sanye_anime.sanye_anime_episode
 where anime_id not in (127, 128, 133, 135, 136, 137);

delete from sanye_anime.sanye_anime_schedule
 where anime_id not in (127, 128, 133, 135, 136, 137);

delete from sanye_anime.sanye_anime_tag
 where anime_id not in (127, 128, 133, 135, 136, 137);

delete from sanye_anime.sanye_anime
 where id not in (127, 128, 133, 135, 136, 137);

select setval(
    'sanye_anime_id_seq',
    coalesce((select max(id) from sanye_anime.sanye_anime), 1),
    true
);

-- 修复历史环境：V3 早期版本在种子插入前 setval 导致序列停在 1，
-- 按表内最大 id 对齐，避免新建作品与种子 id 冲突。
select setval('sanye_anime_id_seq', coalesce((select max(id) from sanye_anime), 1), true);

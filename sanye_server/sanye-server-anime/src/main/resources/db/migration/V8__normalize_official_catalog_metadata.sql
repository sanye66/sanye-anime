-- 补齐正式导入作品的展示元数据，保证首页、排期和详情聚合在清理测试数据后仍可用。
update sanye_anime.sanye_anime
set score = 9.1,
    update_text = '已完结',
    tags_json = '["剧场版","爱情","奇幻"]'::jsonb
where id = 127;

update sanye_anime.sanye_anime
set score = 9.4,
    update_text = '周日 21:00 更新',
    tags_json = '["异世界","冒险","奇幻"]'::jsonb
where id = 128;

update sanye_anime.sanye_anime
set score = 9.2,
    update_text = '已完结',
    tags_json = '["异世界","冒险","成长"]'::jsonb
where id = 133;

update sanye_anime.sanye_anime
set score = 9.1,
    update_text = '已完结',
    tags_json = '["异世界","冒险","剧情"]'::jsonb
where id = 135;

update sanye_anime.sanye_anime
set score = 9.3,
    update_text = '已完结',
    tags_json = '["异世界","冒险","魔法"]'::jsonb
where id = 136;

update sanye_anime.sanye_anime
set score = 8.8,
    update_text = '已完结',
    tags_json = '["异世界","特别篇","冒险"]'::jsonb,
    cover_url = '/covers/mushoku-oad.svg'
where id = 137;

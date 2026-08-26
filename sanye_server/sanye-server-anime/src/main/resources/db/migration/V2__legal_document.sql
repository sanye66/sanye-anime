create table if not exists sanye_legal_document (
    doc_key     varchar(32)  primary key,
    title       varchar(100) not null,
    content     text         not null,
    status      varchar(16)  not null default '草稿',
    updated_by  varchar(64),
    updated_at  timestamptz  not null default now()
);

insert into sanye_legal_document (doc_key, title, content, status, updated_by) values
('privacy', '隐私政策摘要',
 E'sanye_anime 只在提供账户、收藏、历史和 AI 会话功能所必需的范围内处理用户数据。你可以在客户端设置中查看、导出或删除属于自己的数据。\n\nAI 回答是基于已发布作品信息生成的辅助内容，不应替代官方来源。你可以使用避免剧透模式，并在发现内容问题时提交反馈。',
 '已发布', 'seed'),
('terms', '使用条款摘要',
 E'sanye_anime 提供动漫内容发现、搜索与 AI 对话服务，公开内容仅用于信息展示。\n\n用户应对自己提交的问题、反馈和账户操作负责；产品不提供未授权的观看、下载或资源聚合。',
 '已发布', 'seed'),
('copyright', '版权与内容来源',
 E'作品信息、图片和外部链接必须经过来源审核，并在发布记录中保留授权范围与有效期。\n\n权利人提出异议后，相关内容会按流程下架并保留审计记录。',
 '已发布', 'seed'),
('contact', '联系我们',
 E'关于隐私、内容来源和账号数据的疑问，可以发送邮件至 support@sanye.example。\n\n以上邮箱为原型演示占位信息，正式上线前替换为实际联系渠道。',
 '已发布', 'seed')
on conflict (doc_key) do nothing;

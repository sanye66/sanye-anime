-- T-F-01：账户与认证表 id 序列（V1 未设置默认值，insert returning id 会失败）
create sequence if not exists sanye_auth.sanye_user_account_id_seq;
alter table sanye_user_account alter column id set default nextval('sanye_auth.sanye_user_account_id_seq');
select setval('sanye_auth.sanye_user_account_id_seq', coalesce((select max(id) from sanye_user_account), 1), true);

create sequence if not exists sanye_auth.sanye_user_auth_id_seq;
alter table sanye_user_auth alter column id set default nextval('sanye_auth.sanye_user_auth_id_seq');
select setval('sanye_auth.sanye_user_auth_id_seq', coalesce((select max(id) from sanye_user_auth), 1), true);

-- T-F-09：作品导入来源和已上传封面路径。
alter table sanye_anime add column if not exists cover_url varchar(1000);
alter table sanye_anime alter column source type varchar(1000);

create sequence if not exists sanye_file.sanye_file_object_id_seq;
alter table sanye_file_object alter column id set default nextval('sanye_file.sanye_file_object_id_seq');

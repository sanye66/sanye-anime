alter table sanye_feedback add column if not exists device_key varchar(64);
alter table sanye_feedback add column if not exists contact varchar(128);
create sequence if not exists sanye_feedback.sanye_feedback_id_seq;
alter table sanye_feedback alter column id set default nextval('sanye_feedback.sanye_feedback_id_seq');
create sequence if not exists sanye_feedback.sanye_feedback_handle_log_id_seq;
alter table sanye_feedback_handle_log alter column id set default nextval('sanye_feedback.sanye_feedback_handle_log_id_seq');

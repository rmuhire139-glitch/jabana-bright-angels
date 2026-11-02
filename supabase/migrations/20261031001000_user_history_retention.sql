do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.school_users'::regclass
      and conrelid in (
        'public.school_email_connections'::regclass,
        'public.student_marks'::regclass,
        'public.teaching_assignments'::regclass,
        'public.class_timetables'::regclass,
        'public.fee_announcements'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', constraint_record.table_name, constraint_record.conname);
  end loop;
end;
$$;

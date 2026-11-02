create table public.school_users (
  "_id" text primary key,
  email text not null unique,
  "passwordHash" text not null,
  "authVersion" integer not null default 0,
  role text not null check (role in ('administrator', 'dos', 'teacher', 'dos_teacher', 'accountant')),
  "teacherName" text not null default '',
  "teacherStudies" text not null default '',
  "teacherGroupApproved" boolean not null default false,
  "assignedCourses" text[] not null default '{}',
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.school_sessions (
  "_id" text primary key,
  "userId" text not null references public.school_users("_id"),
  "authVersion" integer not null,
  "tokenHash" text not null unique,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index school_sessions_expires_at_idx on public.school_sessions ("expiresAt");
create index school_sessions_user_id_idx on public.school_sessions ("userId");

create table public.password_recoveries (
  "_id" text primary key,
  "userId" text not null unique references public.school_users("_id"),
  "codeHash" text not null,
  attempts integer not null default 0,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index password_recoveries_expires_at_idx on public.password_recoveries ("expiresAt");

create table public.task_states (
  "_id" text primary key,
  "userId" text not null references public.school_users("_id"),
  "taskKey" text not null,
  "completedAt" timestamptz,
  history jsonb not null default '[]'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("userId", "taskKey")
);

create table public.contact_messages (
  "_id" text primary key,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  "dismissedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index contact_messages_created_at_idx on public.contact_messages ("createdAt" desc);

create table public.google_oauth_states (
  "_id" text primary key,
  "userId" text not null references public.school_users("_id"),
  "stateHash" text not null unique,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index google_oauth_states_expires_at_idx on public.google_oauth_states ("expiresAt");

create table public.school_email_connections (
  "_id" text primary key,
  key text not null unique check (key = 'school'),
  email text not null,
  "encryptedRefreshToken" text not null,
  "tokenIv" text not null,
  "tokenAuthTag" text not null,
  "connectedBy" text not null references public.school_users("_id"),
  "connectedAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.admission_inquiries (
  "_id" text primary key,
  "studentName" text not null,
  grade text not null,
  "guardianName" text not null,
  email text not null,
  phone text not null,
  message text not null default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'closed', 'registered')),
  "studentId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index admission_inquiries_created_at_idx on public.admission_inquiries ("createdAt" desc);

create table public.students (
  "_id" text primary key,
  name text not null,
  grade text not null,
  "guardianName" text not null default '',
  "guardianPhone" text not null default '',
  "sdmsCode" text,
  "admissionInquiryId" text unique,
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create unique index students_sdms_code_idx on public.students ("sdmsCode") where "sdmsCode" is not null;
alter table public.students
  add constraint students_admission_inquiry_id_fkey
  foreign key ("admissionInquiryId") references public.admission_inquiries("_id");
alter table public.admission_inquiries
  add constraint admission_inquiries_student_id_fkey
  foreign key ("studentId") references public.students("_id");

create table public.student_marks (
  "_id" text primary key,
  "studentId" text not null references public.students("_id"),
  "studentNumber" text not null,
  "studentName" text not null,
  "classGrade" text not null default '',
  "subjectCode" text not null,
  "subjectName" text not null,
  "assessmentType" text not null,
  "assessmentName" text not null,
  "marksObtained" numeric not null check ("marksObtained" >= 0),
  "maxMarks" numeric not null check ("maxMarks" > 0),
  term text not null,
  "academicYear" text not null,
  "calculatedGrade" text not null default '',
  "gradePoints" numeric,
  remarks text not null default '',
  "importedBy" text not null references public.school_users("_id"),
  "importedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("studentNumber", "subjectCode", "assessmentType", "assessmentName", term, "academicYear")
);
create index student_marks_student_term_idx on public.student_marks ("studentId", "academicYear", term);

create table public.teaching_assignments (
  "_id" text primary key,
  "academicYear" text not null,
  "teacherId" text not null references public.school_users("_id"),
  grade text not null,
  subject text not null,
  "periodsPerWeek" integer not null check ("periodsPerWeek" between 1 and 40),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("academicYear", "teacherId", grade, subject)
);

create table public.class_timetables (
  "_id" text primary key,
  "academicYear" text not null unique,
  slots jsonb not null default '[]'::jsonb,
  "generatedBy" text not null references public.school_users("_id"),
  "generatedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.student_fees (
  "_id" text primary key,
  "studentId" text not null references public.students("_id"),
  "academicYear" text not null,
  term text not null check (term in ('Term 1', 'Term 2', 'Term 3')),
  "amountDue" numeric not null check ("amountDue" >= 1),
  payments jsonb not null default '[]'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("studentId", "academicYear", term)
);

create table public.fee_schedules (
  "_id" text primary key,
  "academicYear" text not null,
  grade text not null,
  term text not null check (term in ('Term 1', 'Term 2', 'Term 3')),
  "amountDue" numeric not null check ("amountDue" >= 1),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("academicYear", grade, term)
);

create table public.stock_items (
  "_id" text primary key,
  name text not null,
  category text not null,
  unit text not null,
  quantity numeric not null check (quantity >= 0),
  "lowStockThreshold" numeric not null check ("lowStockThreshold" >= 0),
  movements jsonb not null default '[]'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.fee_announcements (
  "_id" text primary key,
  title text not null,
  body text not null,
  published boolean not null default true,
  "createdBy" text not null references public.school_users("_id"),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index fee_announcements_created_at_idx on public.fee_announcements ("createdAt" desc);

alter table public.school_users enable row level security;
alter table public.school_sessions enable row level security;
alter table public.password_recoveries enable row level security;
alter table public.task_states enable row level security;
alter table public.contact_messages enable row level security;
alter table public.google_oauth_states enable row level security;
alter table public.school_email_connections enable row level security;
alter table public.admission_inquiries enable row level security;
alter table public.students enable row level security;
alter table public.student_marks enable row level security;
alter table public.teaching_assignments enable row level security;
alter table public.class_timetables enable row level security;
alter table public.student_fees enable row level security;
alter table public.fee_schedules enable row level security;
alter table public.stock_items enable row level security;
alter table public.fee_announcements enable row level security;

grant all on all tables in schema public to service_role;

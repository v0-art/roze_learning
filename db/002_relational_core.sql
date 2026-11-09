-- Foundation for per-course isolation. Not connected to legacy API yet.
-- Migrate identities and permissions explicitly before switching the application.
CREATE TABLE platform_accounts (
  id text PRIMARY KEY,
  username text NOT NULL,
  display_name text NOT NULL,
  email text,
  avatar_url text,
  last_seen_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (length(trim(username)) > 0),
  CHECK (length(trim(display_name)) > 0)
);
CREATE UNIQUE INDEX platform_accounts_username ON platform_accounts (lower(username));
CREATE TABLE platform_account_roles (
  account_id text NOT NULL REFERENCES platform_accounts(id),
  role text NOT NULL CHECK (role IN ('administrator','mentor','student')),
  PRIMARY KEY (account_id, role)
);
CREATE TABLE platform_credentials (
  account_id text PRIMARY KEY REFERENCES platform_accounts(id),
  password_salt bytea NOT NULL,
  password_hash bytea NOT NULL,
  password_algorithm text NOT NULL DEFAULT 'scrypt',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE courses (
  id text PRIMARY KEY,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  owner_id text NOT NULL REFERENCES platform_accounts(id),
  owner_role text GENERATED ALWAYS AS ('mentor') STORED,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id,owner_role) REFERENCES platform_account_roles(account_id,role)
);
CREATE TABLE course_mentors (
  course_id text NOT NULL REFERENCES courses(id),
  mentor_id text NOT NULL REFERENCES platform_accounts(id),
  mentor_role text GENERATED ALWAYS AS ('mentor') STORED,
  can_manage_content boolean NOT NULL DEFAULT false,
  can_manage_mentors boolean NOT NULL DEFAULT false,
  can_manage_students boolean NOT NULL DEFAULT false,
  can_review boolean NOT NULL DEFAULT false,
  PRIMARY KEY (course_id, mentor_id),
  FOREIGN KEY (mentor_id, mentor_role) REFERENCES platform_account_roles(account_id, role)
);
CREATE TABLE course_students (
  course_id text NOT NULL REFERENCES courses(id),
  student_id text NOT NULL REFERENCES platform_accounts(id),
  student_role text GENERATED ALWAYS AS ('student') STORED,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (course_id, student_id),
  FOREIGN KEY (student_id, student_role) REFERENCES platform_account_roles(account_id, role)
);
CREATE TABLE student_mentors (
  course_id text NOT NULL,
  student_id text NOT NULL,
  mentor_id text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, student_id, mentor_id),
  FOREIGN KEY (course_id,student_id) REFERENCES course_students(course_id,student_id),
  FOREIGN KEY (course_id,mentor_id) REFERENCES course_mentors(course_id,mentor_id)
);
CREATE TABLE course_modules (
  course_id text NOT NULL REFERENCES courses(id),
  id text NOT NULL,
  title text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  legacy_topics_count integer,
  legacy_published_lessons_count integer,
  legacy_updated_at timestamptz,
  introduction text NOT NULL DEFAULT '',
  why_it_matters text NOT NULL DEFAULT '',
  what_is_studied text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','approved','published','archived')),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (course_id,id), UNIQUE(course_id,position)
);
CREATE TABLE course_topics (
  course_id text NOT NULL,
  module_id text NOT NULL,
  id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  control_work_id text,
  legacy_updated_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','approved','published','archived')),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (course_id,id), UNIQUE(course_id,module_id,position), UNIQUE(course_id,module_id,id),
  FOREIGN KEY (course_id,module_id) REFERENCES course_modules(course_id,id)
);
CREATE TABLE course_lessons (
  course_id text NOT NULL,
  topic_id text NOT NULL,
  id text NOT NULL,
  title text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','approved','published','archived')),
  duration_minutes integer CHECK(duration_minutes IS NULL OR duration_minutes >= 0),
  current_version text,
  content_hash text,
  legacy_updated_at timestamptz,
  previous_lesson_id text,
  next_lesson_id text,
  PRIMARY KEY (course_id,id), UNIQUE(course_id,topic_id,position), UNIQUE(course_id,topic_id,id),
  FOREIGN KEY(course_id,previous_lesson_id) REFERENCES course_lessons(course_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(course_id,next_lesson_id) REFERENCES course_lessons(course_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (course_id,topic_id) REFERENCES course_topics(course_id,id)
);
CREATE TABLE lesson_versions (
  course_id text NOT NULL,
  lesson_id text NOT NULL,
  id text NOT NULL,
  prompt_text text NOT NULL,
  version_label text NOT NULL,
  author_id text NOT NULL REFERENCES platform_accounts(id),
  author_display_name text,
  changelog text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','approved','published','archived')), 
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id,lesson_id,id),
  FOREIGN KEY (course_id,lesson_id) REFERENCES course_lessons(course_id,id),
  FOREIGN KEY (course_id,author_id) REFERENCES course_mentors(course_id,mentor_id)
);
CREATE TABLE prompt_snapshots (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  lesson_id text NOT NULL,
  lesson_version_id text NOT NULL,
  student_id text NOT NULL,
  prompt_text text NOT NULL,
  source_sha256 bytea NOT NULL CHECK (octet_length(source_sha256)=32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,student_id,lesson_id,id),
  FOREIGN KEY(course_id,lesson_id,lesson_version_id) REFERENCES lesson_versions(course_id,lesson_id,id),
  FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id)
);
CREATE TABLE lesson_attempts (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  lesson_id text NOT NULL,
  lesson_version_id text NOT NULL,
  student_id text NOT NULL,
  snapshot_id text,
  report_sha256 bytea CHECK (report_sha256 IS NULL OR octet_length(report_sha256)=32),
  status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','completed','needs-review','in-progress')),
  score numeric,
  max_score numeric,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (score IS NULL OR (max_score > 0 AND score >= 0 AND score <= max_score)),
  FOREIGN KEY (course_id,lesson_id,lesson_version_id) REFERENCES lesson_versions(course_id,lesson_id,id),
  FOREIGN KEY (course_id,student_id) REFERENCES course_students(course_id,student_id),
  FOREIGN KEY (course_id,student_id,lesson_id,snapshot_id) REFERENCES prompt_snapshots(course_id,student_id,lesson_id,id),
  UNIQUE (course_id,student_id,lesson_id,report_sha256),
  UNIQUE (course_id,student_id,id)
);
CREATE TABLE homework_assignments (
  id text NOT NULL,
  course_id text NOT NULL,
  student_id text NOT NULL,
  attempt_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','submitted','needs_revision','not_submitted','checked','verified')),
  PRIMARY KEY (course_id,student_id,id),
  FOREIGN KEY (course_id,student_id,attempt_id) REFERENCES lesson_attempts(course_id,student_id,id)
);
CREATE INDEX lesson_attempts_student ON lesson_attempts(course_id,student_id,submitted_at DESC);
CREATE INDEX student_mentors_mentor ON student_mentors(mentor_id,course_id,student_id);
CREATE TABLE lesson_question_results (
  attempt_id text NOT NULL REFERENCES lesson_attempts(id),
  question_id text NOT NULL,
  result text NOT NULL CHECK (result IN ('correct','partial','incorrect')),
  feedback text NOT NULL DEFAULT '',
  student_answer text,
  earned_points numeric,
  max_points numeric,
  needs_recheck boolean NOT NULL DEFAULT false,
  PRIMARY KEY (attempt_id,question_id),
  CHECK (earned_points IS NULL OR (max_points > 0 AND earned_points >= 0 AND earned_points <= max_points))
);
CREATE TABLE knowledge_gaps (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  student_id text NOT NULL,
  source_attempt_id text NOT NULL,
  source_question_id text NOT NULL,
  status text NOT NULL DEFAULT 'needs-review' CHECK (status IN ('needs-review','resolved')),
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_attempt_id,source_question_id) REFERENCES lesson_question_results(attempt_id,question_id),
  FOREIGN KEY (course_id,student_id,source_attempt_id) REFERENCES lesson_attempts(course_id,student_id,id),
  UNIQUE (course_id,student_id,id)
);
CREATE TABLE gap_rechecks (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  student_id text NOT NULL,
  gap_id text NOT NULL,
  checked_attempt_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('persists','resolved','resolved_preliminary')),
  evidence text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (course_id,student_id,gap_id) REFERENCES knowledge_gaps(course_id,student_id,id),
  FOREIGN KEY (course_id,student_id,checked_attempt_id) REFERENCES lesson_attempts(course_id,student_id,id)
);
CREATE TABLE course_library_files (
  course_id text NOT NULL REFERENCES courses(id),
  id text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  file_bytes bytea NOT NULL,
  checksum_sha256 bytea NOT NULL CHECK (octet_length(checksum_sha256)=32),
  legacy_checksum_sha256 bytea CHECK (legacy_checksum_sha256 IS NULL OR octet_length(legacy_checksum_sha256)=32),
  integrity_matches_legacy boolean,
  legacy_declared_size bigint,
  linked_entity text,
  version_label text,
  file_type text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','superseded')),
  legacy_uploaded_by text,
  legacy_content_path text,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  PRIMARY KEY (course_id,id),
  FOREIGN KEY (course_id,uploaded_by) REFERENCES course_mentors(course_id,mentor_id)
);

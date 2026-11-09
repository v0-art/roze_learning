-- Typed, course-scoped educational records. Applied after 002 on an empty migration target.
CREATE TABLE course_relations (
  id text NOT NULL,
  course_id text NOT NULL,
  source_module_id text NOT NULL,
  target_module_id text NOT NULL,
  relation_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  approval_status text NOT NULL DEFAULT 'proposed' CHECK (approval_status IN ('proposed','approved','rejected')),
  display_tier text,
  label text,
  evidence_status text,
  evidence_note text,
  is_access_gate boolean NOT NULL DEFAULT false,
  directionality text,
  PRIMARY KEY(course_id,id),
  CHECK (source_module_id <> target_module_id),
  UNIQUE(course_id,source_module_id,target_module_id,relation_type),
  FOREIGN KEY(course_id,source_module_id) REFERENCES course_modules(course_id,id),
  FOREIGN KEY(course_id,target_module_id) REFERENCES course_modules(course_id,id)
);
CREATE TABLE homework_submissions (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  student_id text NOT NULL,
  homework_id text NOT NULL,
  answer text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,student_id,id),
  FOREIGN KEY(course_id,student_id,homework_id) REFERENCES homework_assignments(course_id,student_id,id)
);
CREATE TABLE homework_reviews (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  student_id text NOT NULL,
  submission_id text NOT NULL,
  reviewer_id text REFERENCES platform_accounts(id),
  source text NOT NULL CHECK(source IN ('self_report','mentor')),
  decision text NOT NULL CHECK(decision IN ('checked','needs_revision','verified')),
  feedback text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(course_id,student_id,submission_id) REFERENCES homework_submissions(course_id,student_id,id),
  FOREIGN KEY(course_id,student_id,reviewer_id) REFERENCES student_mentors(course_id,student_id,mentor_id),
  CHECK ((source='mentor' AND reviewer_id IS NOT NULL) OR (source='self_report' AND reviewer_id IS NULL))
);
CREATE TABLE course_exams (
  course_id text NOT NULL,
  id text NOT NULL,
  module_id text NOT NULL,
  title text NOT NULL,
  definition_type text NOT NULL CHECK(definition_type IN ('control','exam')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','under_review','approved','published','archived')),
  after_topic_id text,
  theory_unique_count integer,
  practical_unique_count integer,
  rubric_fail_max_exclusive numeric,
  rubric_pass_max_exclusive numeric,
  rubric_good_max_exclusive numeric,
  legacy_content_path text,
  legacy_updated_at timestamptz,
  PRIMARY KEY(course_id,id),
  FOREIGN KEY(course_id,module_id) REFERENCES course_modules(course_id,id),
  FOREIGN KEY(course_id,module_id,after_topic_id) REFERENCES course_topics(course_id,module_id,id)
);
CREATE TABLE exam_tickets (
  course_id text NOT NULL,
  exam_id text NOT NULL,
  id text NOT NULL,
  title text,
  topic_id text,
  theory_1 text NOT NULL,
  theory_2 text NOT NULL,
  practical text NOT NULL,
  weight_theory_1 numeric,
  weight_theory_2 numeric,
  weight_practical numeric,
  PRIMARY KEY(course_id,exam_id,id),
  FOREIGN KEY(course_id,topic_id) REFERENCES course_topics(course_id,id),
  FOREIGN KEY(course_id,exam_id) REFERENCES course_exams(course_id,id)
);
CREATE TABLE course_messages (
  id text NOT NULL,
  course_id text NOT NULL REFERENCES courses(id),
  sender_id text NOT NULL REFERENCES platform_accounts(id),
  recipient_id text NOT NULL REFERENCES platform_accounts(id),
  content text NOT NULL CHECK(length(trim(content))>0),
  subject text,
  sender_display_name text,
  sender_legacy_role text,
  context_type text,
  context_id text,
  context_title text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK(sender_id<>recipient_id),
  PRIMARY KEY(course_id,id)
);
CREATE TABLE course_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id text,
  course_id text NOT NULL REFERENCES courses(id),
  actor_id text NOT NULL REFERENCES platform_accounts(id),
  actor_display_name text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,legacy_id)
);
CREATE INDEX homework_submissions_lookup ON homework_submissions(course_id,student_id,homework_id,submitted_at DESC);
CREATE INDEX homework_reviews_submission ON homework_reviews(submission_id,created_at DESC);
CREATE INDEX course_messages_inbox ON course_messages(recipient_id,created_at DESC) WHERE read_at IS NULL;
CREATE INDEX course_audit_recent ON course_audit_events(course_id,created_at DESC);
CREATE INDEX relations_by_target ON course_relations(course_id,target_module_id);

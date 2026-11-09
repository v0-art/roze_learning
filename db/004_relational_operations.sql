-- Additional relational records; no JSON/JSONB columns.
CREATE TABLE account_sessions (
  token_hash bytea PRIMARY KEY CHECK(octet_length(token_hash)=32),
  account_id text NOT NULL REFERENCES platform_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK(expires_at > created_at)
);
CREATE INDEX account_sessions_account ON account_sessions(account_id,expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX account_sessions_expiry ON account_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE TABLE course_skills (
  course_id text NOT NULL,
  id text NOT NULL,
  module_id text NOT NULL,
  topic_id text,
  lesson_id text,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','under_review','approved','published','archived')),
  PRIMARY KEY(course_id,id),
  FOREIGN KEY(course_id,module_id) REFERENCES course_modules(course_id,id),
  FOREIGN KEY(course_id,module_id,topic_id) REFERENCES course_topics(course_id,module_id,id),
  FOREIGN KEY(course_id,topic_id,lesson_id) REFERENCES course_lessons(course_id,topic_id,id),
  CHECK(lesson_id IS NULL OR topic_id IS NOT NULL)
);
CREATE INDEX course_skills_lesson ON course_skills(course_id,lesson_id) WHERE lesson_id IS NOT NULL;
CREATE TABLE skill_relations (
  course_id text NOT NULL,
  source_skill_id text NOT NULL,
  target_skill_id text NOT NULL,
  relation_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  PRIMARY KEY(course_id,source_skill_id,target_skill_id,relation_type),
  CHECK(source_skill_id <> target_skill_id),
  FOREIGN KEY(course_id,source_skill_id) REFERENCES course_skills(course_id,id),
  FOREIGN KEY(course_id,target_skill_id) REFERENCES course_skills(course_id,id)
);
CREATE INDEX skill_relations_target ON skill_relations(course_id,target_skill_id);
CREATE TABLE course_assessments (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  exam_id text NOT NULL,
  student_id text NOT NULL,
  attempt_number integer NOT NULL CHECK(attempt_number > 0),
  score numeric NOT NULL,
  max_score numeric NOT NULL CHECK(max_score > 0),
  review_status text NOT NULL CHECK(review_status IN ('self_reported','mentor_confirmed','needs_correction')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CHECK(score >= 0 AND score <= max_score),
  UNIQUE(course_id,student_id,exam_id,attempt_number),
  FOREIGN KEY(course_id,exam_id) REFERENCES course_exams(course_id,id),
  FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id)
);
CREATE INDEX course_assessments_student ON course_assessments(course_id,student_id,submitted_at DESC);
CREATE INDEX prompt_snapshots_student ON prompt_snapshots(course_id,student_id,lesson_id,created_at DESC);

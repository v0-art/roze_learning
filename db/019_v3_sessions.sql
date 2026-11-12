-- Issued archives and submitted reports are append-only historical records.
CREATE TABLE v3_sessions (
 id text PRIMARY KEY,
 course_id text NOT NULL,
 student_id text NOT NULL,
 item_id text NOT NULL,
 item_kind text NOT NULL CHECK(item_kind IN ('lesson','control_work','exam','remedial')),
 item_revision integer NOT NULL,
 regulation_id text NOT NULL,
 regulation_revision integer NOT NULL,
 attempt_number integer NOT NULL CHECK(attempt_number > 0),
 ticket_id text,
 bank_revision integer,
 context jsonb NOT NULL,
 package_bytes bytea NOT NULL,
 package_sha256 bytea NOT NULL CHECK(octet_length(package_sha256)=32),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id),
 FOREIGN KEY(course_id,item_id,item_revision) REFERENCES v3_content_revisions(course_id,entity_id,revision),
 FOREIGN KEY(course_id,regulation_id,regulation_revision) REFERENCES v3_content_revisions(course_id,entity_id,revision),
 UNIQUE(course_id,student_id,item_id,attempt_number)
);
CREATE INDEX v3_sessions_student ON v3_sessions(course_id,student_id,item_id,created_at DESC);
CREATE TABLE v3_reports (
 session_id text PRIMARY KEY REFERENCES v3_sessions(id),
 report jsonb NOT NULL,
 original_report_bytes bytea NOT NULL,
 transport_bytes bytea NOT NULL,
 report_sha256 bytea NOT NULL CHECK(octet_length(report_sha256)=32),
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE v3_homework (
 course_id text NOT NULL,student_id text NOT NULL,id text NOT NULL,source_item_id text NOT NULL,
 title text NOT NULL,description text NOT NULL,status text NOT NULL CHECK(status IN ('assigned','pending','checked','needs_revision','not_submitted')),
 PRIMARY KEY(course_id,student_id,id),FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id)
);
CREATE TABLE v3_rechecks (
 course_id text NOT NULL,student_id text NOT NULL,source_item_id text NOT NULL,question_id text NOT NULL,
 prompt text NOT NULL,status text NOT NULL CHECK(status IN ('open','resolved')),
 PRIMARY KEY(course_id,student_id,source_item_id,question_id),FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id)
);
CREATE INDEX v3_open_homework ON v3_homework(course_id,student_id,source_item_id) WHERE status<>'checked';
CREATE INDEX v3_open_rechecks ON v3_rechecks(course_id,student_id,source_item_id) WHERE status='open';
CREATE TABLE v3_knowledge_gaps (
 course_id text NOT NULL,student_id text NOT NULL,id text NOT NULL,source_item_id text NOT NULL,
 description text NOT NULL,status text NOT NULL CHECK(status IN ('open','resolved')),
 PRIMARY KEY(course_id,student_id,id),FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id)
);
CREATE TABLE v3_context_history (
 id text PRIMARY KEY,session_id text NOT NULL REFERENCES v3_sessions(id),kind text NOT NULL,
 source_item_id text NOT NULL,source_id text NOT NULL,status text NOT NULL,details text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE v3_mentor_decisions (
 id text PRIMARY KEY,course_id text NOT NULL,student_id text NOT NULL,item_id text NOT NULL,
 mentor_id text NOT NULL,decision text NOT NULL CHECK(decision IN ('allow_extra_attempt','allow_progress')),
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id),
 FOREIGN KEY(course_id,mentor_id) REFERENCES course_mentors(course_id,mentor_id),
 FOREIGN KEY(course_id,item_id) REFERENCES v3_content_entities(course_id,id)
);
CREATE TABLE v3_mentor_notifications (
 id text PRIMARY KEY,session_id text NOT NULL REFERENCES v3_sessions(id),mentor_id text NOT NULL REFERENCES platform_accounts(id),
 event_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,
 UNIQUE(session_id,mentor_id,event_type)
);
CREATE INDEX v3_mentor_unread_notifications ON v3_mentor_notifications(mentor_id,created_at DESC) WHERE read_at IS NULL;

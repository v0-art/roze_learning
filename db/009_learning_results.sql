-- Structured learning results; raw submitted reports are kept only as original evidence bytes.
ALTER TABLE lesson_attempts ADD COLUMN started_at timestamptz;
ALTER TABLE lesson_attempts ADD COLUMN legacy_attempt_status text;
ALTER TABLE lesson_attempts ADD COLUMN mentor_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE lesson_attempts ADD COLUMN mentor_feedback text;
ALTER TABLE lesson_attempts ADD COLUMN report_schema_version text;
ALTER TABLE lesson_attempts ADD COLUMN reported_lesson_status text;
ALTER TABLE lesson_attempts ADD COLUMN student_notes text;
ALTER TABLE lesson_attempts ADD COLUMN original_report_bytes bytea;
ALTER TABLE lesson_attempts ADD COLUMN original_prompt_snapshot text;
ALTER TABLE lesson_attempts ADD COLUMN original_prompt_version text;
ALTER TABLE lesson_attempts ADD CONSTRAINT lesson_attempts_course_id_unique UNIQUE(course_id,id);
ALTER TABLE lesson_question_results ADD COLUMN question_text text;
CREATE TABLE lesson_question_skills (
 course_id text NOT NULL,attempt_id text NOT NULL,question_id text NOT NULL,skill_id text NOT NULL,position integer NOT NULL CHECK(position>=0),
 PRIMARY KEY(attempt_id,question_id,skill_id),UNIQUE(attempt_id,question_id,position),
 FOREIGN KEY(attempt_id,question_id) REFERENCES lesson_question_results(attempt_id,question_id),
 FOREIGN KEY(course_id,attempt_id) REFERENCES lesson_attempts(course_id,id),
 FOREIGN KEY(course_id,skill_id) REFERENCES course_skills(course_id,id)
);
CREATE TABLE report_covered_topics (
 attempt_id text NOT NULL REFERENCES lesson_attempts(id),position integer NOT NULL CHECK(position>=0),description text NOT NULL,
 PRIMARY KEY(attempt_id,position)
);
CREATE TABLE report_strong_skills (
 course_id text NOT NULL,attempt_id text NOT NULL,position integer NOT NULL CHECK(position>=0),skill_id text NOT NULL,description text NOT NULL,
 PRIMARY KEY(attempt_id,position),FOREIGN KEY(course_id,attempt_id) REFERENCES lesson_attempts(course_id,id),FOREIGN KEY(course_id,skill_id) REFERENCES course_skills(course_id,id)
);
CREATE TABLE report_gap_descriptions (
 course_id text NOT NULL,attempt_id text NOT NULL,position integer NOT NULL CHECK(position>=0),skill_id text NOT NULL,description text NOT NULL,
 status text NOT NULL,mandatory_next_check boolean NOT NULL,
 PRIMARY KEY(attempt_id,position),FOREIGN KEY(course_id,attempt_id) REFERENCES lesson_attempts(course_id,id),FOREIGN KEY(course_id,skill_id) REFERENCES course_skills(course_id,id)
);
CREATE TABLE report_next_instructions (
 attempt_id text NOT NULL REFERENCES lesson_attempts(id),kind text NOT NULL CHECK(kind IN ('mandatory_recheck','homework_check','additional_check')),
 position integer NOT NULL CHECK(position>=0),instruction text NOT NULL,PRIMARY KEY(attempt_id,kind,position)
);
CREATE TABLE report_homework_definitions (
 attempt_id text NOT NULL REFERENCES lesson_attempts(id),position integer NOT NULL CHECK(position>=0),homework_id text NOT NULL,title text NOT NULL,description text NOT NULL,
 PRIMARY KEY(attempt_id,position),UNIQUE(attempt_id,homework_id)
);
CREATE TABLE report_entry_controls (
 attempt_id text PRIMARY KEY REFERENCES lesson_attempts(id),previous_lesson_id text NOT NULL
);
CREATE TABLE report_homework_checks (
 attempt_id text NOT NULL REFERENCES report_entry_controls(attempt_id),position integer NOT NULL CHECK(position>=0),homework_id text NOT NULL,
 status text NOT NULL,feedback text NOT NULL,evidence text,needs_revision boolean,
 PRIMARY KEY(attempt_id,position),UNIQUE(attempt_id,homework_id)
);
CREATE TABLE report_homework_check_details (
 attempt_id text NOT NULL,check_position integer NOT NULL,kind text NOT NULL CHECK(kind IN ('error','skill_id')),
 position integer NOT NULL CHECK(position>=0),value text NOT NULL,PRIMARY KEY(attempt_id,check_position,kind,position),
 FOREIGN KEY(attempt_id,check_position) REFERENCES report_homework_checks(attempt_id,position)
);
CREATE TABLE report_recheck_results (
 attempt_id text NOT NULL REFERENCES report_entry_controls(attempt_id),position integer NOT NULL CHECK(position>=0),
 source_question_id text,source_lesson_id text,source_gap_id text,status text NOT NULL,evidence text NOT NULL,
 PRIMARY KEY(attempt_id,position),CHECK(source_question_id IS NOT NULL OR source_gap_id IS NOT NULL)
);
ALTER TABLE homework_assignments ADD COLUMN assigned_at timestamptz;
ALTER TABLE homework_assignments ADD COLUMN submitted_at timestamptz;
ALTER TABLE homework_assignments ADD COLUMN student_answer text;
ALTER TABLE homework_assignments ADD COLUMN ai_feedback text;
ALTER TABLE homework_assignments ADD COLUMN checked_by_self_report boolean;
ALTER TABLE homework_assignments ADD COLUMN checked_lesson_id text;
ALTER TABLE homework_assignments ADD COLUMN mentor_feedback text;
ALTER TABLE homework_assignments ADD COLUMN verified_at timestamptz;
CREATE TABLE homework_review_history (
 course_id text NOT NULL,student_id text NOT NULL,homework_id text NOT NULL,position integer NOT NULL CHECK(position>=0),
 source_lesson_id text,checked_lesson_id text,status text NOT NULL,feedback text NOT NULL,evidence text,needs_revision boolean,
 source text NOT NULL,recorded_at timestamptz NOT NULL,
 PRIMARY KEY(course_id,student_id,homework_id,position),
 FOREIGN KEY(course_id,student_id,homework_id) REFERENCES homework_assignments(course_id,student_id,id)
);
CREATE TABLE homework_review_details (
 course_id text NOT NULL,student_id text NOT NULL,homework_id text NOT NULL,review_position integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('error','skill_id')),position integer NOT NULL CHECK(position>=0),value text NOT NULL,
 PRIMARY KEY(course_id,student_id,homework_id,review_position,kind,position),
 FOREIGN KEY(course_id,student_id,homework_id,review_position) REFERENCES homework_review_history(course_id,student_id,homework_id,position)
);
ALTER TABLE gap_rechecks ADD COLUMN source text NOT NULL DEFAULT 'student_self_report';
ALTER TABLE knowledge_gaps ADD COLUMN skill_id text;
ALTER TABLE knowledge_gaps ADD COLUMN mandatory_next_check boolean NOT NULL DEFAULT true;
ALTER TABLE knowledge_gaps ADD COLUMN recheck_evidence text;
ALTER TABLE knowledge_gaps ADD COLUMN resolution_source text;
ALTER TABLE knowledge_gaps ADD CONSTRAINT knowledge_gaps_skill_fk FOREIGN KEY(course_id,skill_id) REFERENCES course_skills(course_id,id);
CREATE INDEX lesson_question_skills_lookup ON lesson_question_skills(course_id,skill_id,attempt_id);
CREATE INDEX homework_review_history_lookup ON homework_review_history(course_id,student_id,homework_id,recorded_at DESC);

ALTER TABLE lesson_attempts ADD COLUMN reported_earned_score numeric;
ALTER TABLE lesson_attempts ADD COLUMN reported_max_score numeric;
ALTER TABLE lesson_attempts ADD COLUMN confirmed_at timestamptz;
ALTER TABLE knowledge_gaps ALTER COLUMN source_question_id DROP NOT NULL;
ALTER TABLE knowledge_gaps ADD COLUMN legacy_skill_name text;
ALTER TABLE knowledge_gaps ADD COLUMN resolved_at timestamptz;
ALTER TABLE homework_assignments DROP CONSTRAINT homework_assignments_status_check;
ALTER TABLE homework_assignments ADD CONSTRAINT homework_assignments_status_check CHECK(status IN ('assigned','submitted','needs_revision','not_submitted','checked','verified','rejected'));
CREATE TABLE homework_skills (
 course_id text NOT NULL,student_id text NOT NULL,homework_id text NOT NULL,skill_id text NOT NULL,position integer NOT NULL CHECK(position>=0),
 PRIMARY KEY(course_id,student_id,homework_id,skill_id),UNIQUE(course_id,student_id,homework_id,position),
 FOREIGN KEY(course_id,student_id,homework_id) REFERENCES homework_assignments(course_id,student_id,id),
 FOREIGN KEY(course_id,skill_id) REFERENCES course_skills(course_id,id)
);

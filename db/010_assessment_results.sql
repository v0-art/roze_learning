ALTER TABLE course_assessments ADD COLUMN target_title text;
ALTER TABLE course_assessments ADD COLUMN legacy_type text CHECK(legacy_type IS NULL OR legacy_type IN ('exam','control_work'));
ALTER TABLE course_assessments ADD COLUMN percentage numeric;
ALTER TABLE course_assessments ADD COLUMN grade text;
ALTER TABLE course_assessments ADD COLUMN feedback text;
ALTER TABLE course_assessments ADD COLUMN requires_intervention boolean;
ALTER TABLE course_assessments ADD COLUMN theory_1_score numeric;
ALTER TABLE course_assessments ADD COLUMN theory_2_score numeric;
ALTER TABLE course_assessments ADD COLUMN practical_score numeric;
ALTER TABLE course_assessments ADD COLUMN answers_notes text;
CREATE TABLE assessment_retake_grants (
 course_id text NOT NULL,id text NOT NULL,student_id text NOT NULL,exam_id text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(course_id,id),FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id),
 FOREIGN KEY(course_id,exam_id) REFERENCES course_exams(course_id,id)
);
CREATE INDEX assessment_retake_grants_student ON assessment_retake_grants(course_id,student_id,exam_id,created_at);

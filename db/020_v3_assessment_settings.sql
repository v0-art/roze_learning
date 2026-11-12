-- Explicit migration decisions; NULL means the mentor has not decided yet.
CREATE TABLE v3_assessment_settings (
 course_id text NOT NULL,
 exam_id text NOT NULL,
 max_score numeric CHECK(max_score > 0),
 theory_1_weight numeric CHECK(theory_1_weight >= 0),
 theory_2_weight numeric CHECK(theory_2_weight >= 0),
 practical_weight numeric CHECK(practical_weight >= 0),
 blocks_next boolean,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,exam_id),
 FOREIGN KEY(course_id,exam_id) REFERENCES course_exams(course_id,id),
 FOREIGN KEY(course_id,updated_by) REFERENCES course_mentors(course_id,mentor_id),
 CHECK ((theory_1_weight IS NULL AND theory_2_weight IS NULL AND practical_weight IS NULL)
  OR (max_score IS NOT NULL AND theory_1_weight IS NOT NULL AND theory_2_weight IS NOT NULL
      AND practical_weight IS NOT NULL AND theory_1_weight+theory_2_weight+practical_weight=max_score))
);

-- Homework identifiers are scoped to their source activity.
ALTER TABLE v3_homework DROP CONSTRAINT v3_homework_pkey;
ALTER TABLE v3_homework ADD PRIMARY KEY(course_id,student_id,source_item_id,id);

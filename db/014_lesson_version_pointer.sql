-- Prompt snapshots keep immutable version IDs even after a mentor edits a lesson.
ALTER TABLE course_lessons ADD COLUMN current_lesson_version_id text;
UPDATE course_lessons l SET current_lesson_version_id='current'
 WHERE EXISTS(SELECT 1 FROM lesson_versions v WHERE v.course_id=l.course_id AND v.lesson_id=l.id AND v.id='current');
ALTER TABLE course_lessons ADD CONSTRAINT course_lessons_current_version_fk
 FOREIGN KEY(course_id,id,current_lesson_version_id) REFERENCES lesson_versions(course_id,lesson_id,id) DEFERRABLE INITIALLY DEFERRED;

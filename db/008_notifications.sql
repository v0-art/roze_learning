CREATE TABLE course_notifications (
 id text NOT NULL,
 course_id text NOT NULL REFERENCES courses(id),
 student_id text REFERENCES platform_accounts(id),
 student_display_name text,
 title text NOT NULL,
 description text NOT NULL,
 event_type text NOT NULL,
 related_entity_id text,
 status text NOT NULL,
 score numeric,
 max_score numeric,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,id),
 FOREIGN KEY(course_id,student_id) REFERENCES course_students(course_id,student_id)
);
CREATE INDEX course_notifications_unread ON course_notifications(course_id,created_at DESC) WHERE status='unread';

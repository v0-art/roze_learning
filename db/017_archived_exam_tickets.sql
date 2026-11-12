-- Keep removed tickets for history; runtime roles need no DELETE privilege.
ALTER TABLE exam_tickets ADD COLUMN archived_at timestamptz;
CREATE INDEX exam_tickets_active ON exam_tickets(course_id,exam_id,id) WHERE archived_at IS NULL;

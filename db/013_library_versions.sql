ALTER TABLE course_library_files ADD COLUMN updated_at timestamptz;
CREATE TABLE course_library_file_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 course_id text NOT NULL,
 file_id text NOT NULL,
 filename text NOT NULL,
 file_type text,
 linked_entity text,
 file_bytes bytea NOT NULL,
 checksum_sha256 bytea NOT NULL CHECK(octet_length(checksum_sha256)=32),
 changed_by text NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(course_id,file_id) REFERENCES course_library_files(course_id,id),
 FOREIGN KEY(course_id,changed_by) REFERENCES course_mentors(course_id,mentor_id)
);
CREATE INDEX course_library_versions_lookup ON course_library_file_versions(course_id,file_id,archived_at DESC);

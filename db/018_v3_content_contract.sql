-- Immutable content revisions; active publication remains separate from drafts.
CREATE TABLE v3_content_entities (
 course_id text NOT NULL REFERENCES courses(id),
 id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('course','module','topic','lesson','control_work','exam','assessment_bank','skill','relation','regulation','curriculum_plan')),
 published_revision integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,id),
 UNIQUE(course_id,id,kind)
);
CREATE TABLE v3_content_revisions (
 course_id text NOT NULL,
 entity_id text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 kind text NOT NULL,
 content jsonb NOT NULL,
 assets jsonb NOT NULL DEFAULT '{}'::jsonb,
 content_sha256 bytea NOT NULL CHECK(octet_length(content_sha256)=32),
 author_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,entity_id,revision),
 FOREIGN KEY(course_id,entity_id,kind) REFERENCES v3_content_entities(course_id,id,kind),
 FOREIGN KEY(course_id,author_id) REFERENCES course_mentors(course_id,mentor_id)
);
ALTER TABLE v3_content_entities ADD CONSTRAINT v3_published_revision_fk
 FOREIGN KEY(course_id,id,published_revision) REFERENCES v3_content_revisions(course_id,entity_id,revision)
 DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX v3_content_revision_hash ON v3_content_revisions(course_id,entity_id,content_sha256);

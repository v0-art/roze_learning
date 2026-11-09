-- Course-specific rules must not leak into another mentor's curriculum.
ALTER TABLE courses ADD COLUMN curriculum_profile text NOT NULL DEFAULT 'generic'
 CHECK(curriculum_profile IN ('generic','nexus-v1'));

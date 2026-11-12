-- The plan contract supports optional remedial activities; persist their content too.
ALTER TABLE v3_content_entities DROP CONSTRAINT v3_content_entities_kind_check;
ALTER TABLE v3_content_entities ADD CONSTRAINT v3_content_entities_kind_check
 CHECK(kind IN ('course','module','topic','lesson','remedial','control_work','exam','assessment_bank','skill','relation','regulation','curriculum_plan'));

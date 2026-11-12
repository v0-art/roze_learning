-- Gap identifiers can recur in different activities without merging their history.
ALTER TABLE v3_knowledge_gaps DROP CONSTRAINT v3_knowledge_gaps_pkey;
ALTER TABLE v3_knowledge_gaps ADD PRIMARY KEY(course_id,student_id,source_item_id,id);

CREATE TABLE module_prerequisites (
 course_id text NOT NULL, module_id text NOT NULL, prerequisite_module_id text NOT NULL, position integer NOT NULL CHECK(position>=0),
 PRIMARY KEY(course_id,module_id,prerequisite_module_id), UNIQUE(course_id,module_id,position),
 CHECK(module_id<>prerequisite_module_id),
 FOREIGN KEY(course_id,module_id) REFERENCES course_modules(course_id,id),
 FOREIGN KEY(course_id,prerequisite_module_id) REFERENCES course_modules(course_id,id)
);
CREATE TABLE module_applications (
 course_id text NOT NULL,module_id text NOT NULL,position integer NOT NULL CHECK(position>=0),description text NOT NULL,
 PRIMARY KEY(course_id,module_id,position),FOREIGN KEY(course_id,module_id) REFERENCES course_modules(course_id,id)
);
CREATE TABLE topic_objectives (
 course_id text NOT NULL,topic_id text NOT NULL,position integer NOT NULL CHECK(position>=0),description text NOT NULL,
 PRIMARY KEY(course_id,topic_id,position),FOREIGN KEY(course_id,topic_id) REFERENCES course_topics(course_id,id)
);
CREATE TABLE lesson_objectives (
 course_id text NOT NULL,lesson_id text NOT NULL,position integer NOT NULL CHECK(position>=0),description text NOT NULL,
 PRIMARY KEY(course_id,lesson_id,position),FOREIGN KEY(course_id,lesson_id) REFERENCES course_lessons(course_id,id)
);
CREATE TABLE lesson_prerequisites (
 course_id text NOT NULL,lesson_id text NOT NULL,prerequisite_lesson_id text NOT NULL,position integer NOT NULL CHECK(position>=0),
 PRIMARY KEY(course_id,lesson_id,prerequisite_lesson_id), UNIQUE(course_id,lesson_id,position),CHECK(lesson_id<>prerequisite_lesson_id),
 FOREIGN KEY(course_id,lesson_id) REFERENCES course_lessons(course_id,id),
 FOREIGN KEY(course_id,prerequisite_lesson_id) REFERENCES course_lessons(course_id,id)
);
CREATE TABLE relation_knowledge_transfers (
 course_id text NOT NULL,
 relation_id text NOT NULL,
 position integer NOT NULL CHECK(position>=0),
 concept text NOT NULL,
 explanation text NOT NULL DEFAULT '',
 PRIMARY KEY(course_id,relation_id,position),
 FOREIGN KEY(course_id,relation_id) REFERENCES course_relations(course_id,id)
);
CREATE INDEX module_prerequisites_dependency ON module_prerequisites(course_id,prerequisite_module_id);
CREATE INDEX lesson_prerequisites_dependency ON lesson_prerequisites(course_id,prerequisite_lesson_id);
CREATE TABLE topic_skills (
 course_id text NOT NULL,topic_id text NOT NULL,skill_id text NOT NULL,position integer NOT NULL CHECK(position>=0),
 PRIMARY KEY(course_id,topic_id,skill_id),UNIQUE(course_id,topic_id,position),
 FOREIGN KEY(course_id,topic_id) REFERENCES course_topics(course_id,id),FOREIGN KEY(course_id,skill_id) REFERENCES course_skills(course_id,id)
);
CREATE TABLE lesson_skills (
 course_id text NOT NULL,lesson_id text NOT NULL,skill_id text NOT NULL,position integer NOT NULL CHECK(position>=0),
 PRIMARY KEY(course_id,lesson_id,skill_id),UNIQUE(course_id,lesson_id,position),
 FOREIGN KEY(course_id,lesson_id) REFERENCES course_lessons(course_id,id),FOREIGN KEY(course_id,skill_id) REFERENCES course_skills(course_id,id)
);

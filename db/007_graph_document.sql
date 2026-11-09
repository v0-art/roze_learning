CREATE TABLE course_graph_documents (
 course_id text PRIMARY KEY REFERENCES courses(id),
 graph_id text NOT NULL,schema_version text NOT NULL,title text NOT NULL,locale text NOT NULL,data_status text NOT NULL,
 show_on_node_selection text,show_all_mode boolean,layout text,edges text,access_policy text,colors text,
 declared_nodes integer,declared_edges integer,mentioned_in_draft_passports integer,expert_proposed_extensions integer
);
CREATE TABLE course_graph_sources (
 course_id text NOT NULL REFERENCES course_graph_documents(course_id),position integer NOT NULL CHECK(position>=0),name text NOT NULL,role text NOT NULL,
 PRIMARY KEY(course_id,position)
);
CREATE TABLE course_graph_semantics (
 course_id text NOT NULL REFERENCES course_graph_documents(course_id),key text NOT NULL,value text NOT NULL,PRIMARY KEY(course_id,key)
);
CREATE TABLE course_graph_rules (
 course_id text NOT NULL REFERENCES course_graph_documents(course_id),kind text NOT NULL CHECK(kind IN ('default_visible_tier','filterable_relation')),position integer NOT NULL CHECK(position>=0),value text NOT NULL,
 PRIMARY KEY(course_id,kind,position)
);
CREATE TABLE course_graph_declared_counts (
 course_id text NOT NULL REFERENCES course_graph_documents(course_id),kind text NOT NULL CHECK(kind IN ('relation','tier')),key text NOT NULL,value integer NOT NULL CHECK(value>=0),
 PRIMARY KEY(course_id,kind,key)
);
CREATE TABLE course_graph_document_modules (
 course_id text NOT NULL REFERENCES course_graph_documents(course_id),module_id text NOT NULL,code text NOT NULL,title text NOT NULL,position integer NOT NULL,
 content_approval text NOT NULL,publication_status text NOT NULL,
 PRIMARY KEY(course_id,module_id),FOREIGN KEY(course_id,module_id) REFERENCES course_modules(course_id,id)
);

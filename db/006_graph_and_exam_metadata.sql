-- Existing map nodes and edges are separate from authored interdisciplinary links.
CREATE TABLE course_graph_nodes (
 course_id text NOT NULL REFERENCES courses(id),
 id text NOT NULL,code text,title text NOT NULL,description text NOT NULL DEFAULT '',
 level integer NOT NULL, module_id text, topic_id text,
 position_x numeric,position_y numeric,status text NOT NULL DEFAULT 'draft',
 PRIMARY KEY(course_id,id),
 FOREIGN KEY(course_id,module_id) REFERENCES course_modules(course_id,id),
 FOREIGN KEY(course_id,module_id,topic_id) REFERENCES course_topics(course_id,module_id,id),
 CHECK(topic_id IS NULL OR module_id IS NOT NULL)
);
CREATE TABLE course_graph_node_details (
 course_id text NOT NULL,node_id text NOT NULL,
 detail_type text NOT NULL CHECK(detail_type IN ('prerequisite','future_application')),
 position integer NOT NULL CHECK(position>=0),value text NOT NULL,
 PRIMARY KEY(course_id,node_id,detail_type,position),
 FOREIGN KEY(course_id,node_id) REFERENCES course_graph_nodes(course_id,id)
);
CREATE TABLE course_graph_edges (
 course_id text NOT NULL,id text NOT NULL,source_node_id text NOT NULL,target_node_id text NOT NULL,
 edge_type text NOT NULL,label text NOT NULL DEFAULT '',
 PRIMARY KEY(course_id,id),
 FOREIGN KEY(course_id,source_node_id) REFERENCES course_graph_nodes(course_id,id),
 FOREIGN KEY(course_id,target_node_id) REFERENCES course_graph_nodes(course_id,id)
);
CREATE TABLE course_knowledge_relations (
 course_id text NOT NULL,id text NOT NULL,source_node_id text NOT NULL,target_node_id text NOT NULL,
 relation_type text NOT NULL,description text NOT NULL DEFAULT '',
 PRIMARY KEY(course_id,id),
 FOREIGN KEY(course_id,source_node_id) REFERENCES course_graph_nodes(course_id,id),
 FOREIGN KEY(course_id,target_node_id) REFERENCES course_graph_nodes(course_id,id)
);
CREATE INDEX course_graph_edges_target ON course_graph_edges(course_id,target_node_id);
CREATE INDEX course_knowledge_relations_target ON course_knowledge_relations(course_id,target_node_id);

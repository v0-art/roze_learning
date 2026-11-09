import React, { useEffect, useState } from 'react';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { getModules, getTopics, getRelations, getSkills, getCurrentUser, subscribeToDatabase } from '../services/storage';

interface KnowledgeMapViewProps { navigate: (route: string) => void }

export const KnowledgeMapView: React.FC<KnowledgeMapViewProps> = ({ navigate }) => {
  const [modules, setModules] = useState(getModules());
  const [topics, setTopics] = useState(getTopics());
  const [skills, setSkills] = useState(getSkills());
  const [relations, setRelations] = useState(getRelations());

  useEffect(() => subscribeToDatabase(() => {
    setModules(getModules());
    setTopics(getTopics());
    setRelations(getRelations());
    setSkills(getSkills());
  }), []);

  return <main className="h-full w-full overflow-hidden bg-[#100b19]">
    <KnowledgeGraph modules={modules} topics={topics} relations={relations} skills={skills} onExit={() => navigate(getCurrentUser().role === 'admin' ? '/admin' : '/dashboard')} />
  </main>;
};

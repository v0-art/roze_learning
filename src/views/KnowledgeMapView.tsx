/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Compass, BookOpen, Layers, Award } from "lucide-react";
import { KnowledgeGraph } from "../components/KnowledgeGraph";
import { getGraphData, subscribeToDatabase } from "../services/storage";

interface KnowledgeMapViewProps {
  navigate: (route: string) => void;
}

export const KnowledgeMapView: React.FC<KnowledgeMapViewProps> = ({ navigate }) => {
  const [graphData, setGraphData] = useState(getGraphData());

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setGraphData(getGraphData());
    });
    return unsub;
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              Flight Route Graph
            </span>
            <span className="text-xs text-slate-400 font-mono">18 Дисциплин • Навыки • Зависимости</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mt-1 flex items-center space-x-2.5">
            <Compass className="w-7 h-7 text-cyan-400" />
            <span>Интерактивная карта знаний программы</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Исследуйте граф взаимосвязей между дисциплинами связи, математикой и криптографией. Выберите любой узел для просмотра пререквизитов и будущих применений.
          </p>
        </div>
      </div>

      <KnowledgeGraph
        nodes={graphData.nodes}
        edges={graphData.edges}
        onNavigateToModule={(mId) => navigate(`/course/${mId}`)}
        onNavigateToLesson={(lId) => navigate(`/lesson/${lId}`)}
      />
    </div>
  );
};

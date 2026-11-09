/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Navbar } from "./components/Navbar";
import { ProfileView } from "./views/ProfileView";
import { DashboardView } from "./views/DashboardView";
import { CourseCatalogView } from "./views/CourseCatalogView";
import { ModuleDetailView } from "./views/ModuleDetailView";
import { LessonView } from "./views/LessonView";
import { KnowledgeMapView } from "./views/KnowledgeMapView";
import { ProgressView } from "./views/ProgressView";
import { ExamPrepView } from "./views/ExamPrepView";
import { AssessmentsView } from "./views/AssessmentsView";
import { HomeworkView } from "./views/HomeworkView";
import { AdminOverviewView } from "./views/AdminOverviewView";
import { AdminReportsView } from "./views/AdminReportsView";
import { AdminContentView } from "./views/AdminContentView";
import { AdminLibraryView } from "./views/AdminLibraryView";
import { AdminUsersView } from './views/AdminUsersView';
import { AdminExamsView } from "./views/AdminExamsView";
import { getCurrentUser, subscribeToDatabase } from "./services/storage";
import { ShieldAlert } from "lucide-react";

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.pathname && window.location.pathname !== "/") {
      return window.location.pathname;
    }
    return getCurrentUser().role === "admin" ? "/admin" : "/dashboard";
  });
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [mapLayout, setMapLayout] = useState(() => currentRoute === '/knowledge-map');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setCurrentUser(getCurrentUser());
    });
    const onPopState = () => {
      setCurrentRoute(window.location.pathname || "/dashboard");
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      unsub();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const navigate = (route: string) => {
    setCurrentRoute(route);
    if (typeof window !== "undefined" && window.location.pathname !== route) {
      window.history.pushState(null, "", route);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Render view router
  const renderContent = () => {
    // 1. Lesson View: /lesson/:lessonId
    if (currentRoute.startsWith("/lesson/")) {
      const lessonId = currentRoute.replace("/lesson/", "");
      return <LessonView key={lessonId} lessonId={lessonId} navigate={navigate} />;
    }

    // 2. Module Detail: /course/:moduleId
    if (currentRoute.startsWith("/course/") && currentRoute !== "/course") {
      const moduleId = currentRoute.replace("/course/", "");
      return <ModuleDetailView moduleId={moduleId} navigate={navigate} />;
    }

    // 3. Admin Protected routes (Scenario S)
    if (currentRoute.startsWith("/admin")) {
      if (currentUser.role !== "admin") {
        return (
          <div className="max-w-md mx-auto my-24 p-8 rounded-2xl border border-rose-800 bg-rose-950/40 text-center space-y-4">
            <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
            <h2 className="text-xl font-bold text-slate-100">Отказ в доступе (403 Forbidden)</h2>
            <p className="text-xs text-rose-200 leading-relaxed">
              Раздел предназначен исключительно для Главного ментора. Войдите с учётными данными ментора.
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold"
            >
              Вернуться в дашборд
            </button>
          </div>
        );
      }

      if (currentRoute === "/admin/users") return <AdminUsersView />;
      if (currentRoute === "/admin/reports") {
        return <AdminReportsView />;
      }
      if (currentRoute === "/admin/content/library") {
        return <AdminLibraryView navigate={navigate} />;
      }
      if (currentRoute === "/admin/content") {
        return <AdminContentView navigate={navigate} />;
      }
      if (currentRoute === "/admin/exams") {
        return <AdminExamsView navigate={navigate} />;
      }
      return <AdminOverviewView navigate={navigate} />;
    }

    // 4. Standard Student routes
    switch (currentRoute) {
      case "/profile":
        return <ProfileView />;
      case "/course":
        return <CourseCatalogView navigate={navigate} />;
      case "/knowledge-map":
        return <KnowledgeMapView navigate={navigate} />;
      case "/progress":
        return currentUser.role === 'admin' ? <AdminOverviewView navigate={navigate} /> : <ProgressView />;
      case "/exam-preparation":
        return currentUser.role === 'admin' ? <AdminOverviewView navigate={navigate} /> : <ExamPrepView navigate={navigate} />;
      case "/assessments":
        return currentUser.role === 'admin' ? <AdminOverviewView navigate={navigate} /> : <AssessmentsView navigate={navigate} />;
      case "/homework":
        return <HomeworkView />;
      case "/dashboard":
      default:
        return currentUser.role === 'admin' ? <AdminOverviewView navigate={navigate} /> : <DashboardView navigate={navigate} />;
    }
  };

  const isMap = currentRoute === '/knowledge-map';
  return (
    <div className={`app-shell ${mapLayout ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'} bg-[#110d1b] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950`}>
      <Navbar currentRoute={currentRoute} navigate={navigate} />
      <AnimatePresence mode="wait" initial={false} onExitComplete={() => setMapLayout(isMap)}>
        <motion.main key={currentRoute} className={isMap ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1 pb-16'}
          initial={reducedMotion ? false : {opacity:0, y:8}}
          animate={{opacity:1, y:0}}
          exit={reducedMotion ? {opacity:1} : {opacity:0, y:-5}}
          transition={{duration: reducedMotion ? 0 : .18, ease:'easeOut'}}>
          {isMap ? <KnowledgeMapView navigate={navigate} /> : renderContent()}
        </motion.main>
      </AnimatePresence>
      {!mapLayout && <footer className="border-t border-slate-800/80 bg-[#110d1b] py-6 text-center text-xs text-slate-500 font-mono">
        <p>Rozephyr Learning — Образовательная платформа по кибербезопасности и телекоммуникациям</p>
        <p className="mt-1 text-[11px] text-slate-600">Индивидуальная образовательная траектория • Детерминированная сборка промптов • Интерактивный граф знаний</p>
      </footer>}
    </div>
  );
}

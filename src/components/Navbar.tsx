/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Bell,
  User as UserIcon,
  ChevronDown,
  Compass,
  BookOpen,
  Award,
  Layers,
  FileCheck2,
  Users,
  FolderTree,
  FolderArchive,
  RotateCcw,
  Menu,
  X,
} from 'lucide-react';
import {
  getCurrentUser,
  setCurrentUserId,
  getAllUsers,
  getNotifications,
  subscribeToDatabase,
  resetDatabaseToSeed,
} from '../services/storage';
import { User, AdminNotification } from '../types';

interface NavbarProps {
  currentRoute: string;
  navigate: (route: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, navigate }) => {
  const [currentUser, setUser] = useState<User>(getCurrentUser());
  const [users, setUsers] = useState<User[]>(getAllUsers());
  const [notifications, setNotifications] = useState<AdminNotification[]>(getNotifications());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeToDatabase(() => {
      setUser(getCurrentUser());
      setUsers(getAllUsers());
      setNotifications(getNotifications());
    });
    return unsub;
  }, []);

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  const handleSwitchUser = (userId: string) => {
    setCurrentUserId(userId);
    setShowUserMenu(false);
    setMobileMenuOpen(false);
  };

  const handleResetData = () => {
    if (window.confirm('Сбросить базу данных платформы к исходному состоянию учебной программы?')) {
      resetDatabaseToSeed();
      navigate('/dashboard');
    }
  };

  const navItemClass = (route: string, isPrefix: boolean = false) => {
    const active = isPrefix ? currentRoute.startsWith(route) : currentRoute === route;
    return `px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-1.5 ${
      active
        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
    }`;
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#090F1C]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={() => {
            navigate('/dashboard');
            setMobileMenuOpen(false);
          }}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/40 group-hover:scale-105 transition-transform">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-wider text-slate-100 font-mono">NEXUS</span>
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold tracking-widest">
                ACADEMY
              </span>
            </div>
            <p className="text-[10px] text-slate-400 tracking-tight hidden sm:block">
              Интерактивная подготовка по ИБ и телекоммуникациям
            </p>
          </div>
        </div>

        {/* Primary Desktop Nav */}
        <nav className="hidden lg:flex items-center space-x-1 font-medium">
          <button onClick={() => navigate('/dashboard')} className={navItemClass('/dashboard')}>
            <span>Дашборд</span>
          </button>

          <button onClick={() => navigate('/course')} className={navItemClass('/course', true)}>
            <BookOpen className="w-4 h-4" />
            <span>18 Модулей</span>
          </button>

          <button onClick={() => navigate('/knowledge-map')} className={navItemClass('/knowledge-map')}>
            <Compass className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="font-semibold text-cyan-300">Карта знаний</span>
          </button>

          <button onClick={() => navigate('/progress')} className={navItemClass('/progress')}>
            <Layers className="w-4 h-4" />
            <span>Прогресс</span>
          </button>

          <button onClick={() => navigate('/exam-preparation')} className={navItemClass('/exam-preparation')}>
            <Award className="w-4 h-4" />
            <span>Банк экзаменов</span>
          </button>

          <button onClick={() => navigate('/homework')} className={navItemClass('/homework')}>
            <FileCheck2 className="w-4 h-4" />
            <span>ДЗ</span>
          </button>

          {/* Admin Workspace */}
          {currentUser.role === 'admin' && (
            <div className="flex items-center space-x-1 border-l border-slate-800 pl-2 ml-1">
              <button
                onClick={() => navigate('/admin')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
                  currentRoute === '/admin'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                    : 'text-violet-400 hover:bg-violet-950/40 hover:text-violet-300'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Обзор</span>
              </button>

              <button
                onClick={() => navigate('/admin/content')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
                  currentRoute === '/admin/content'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'text-cyan-400 hover:bg-cyan-950/40 hover:text-cyan-300'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Учебный план</span>
              </button>

              <button
                onClick={() => navigate('/admin/content/library')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
                  currentRoute === '/admin/content/library'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <FolderArchive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Библиотека</span>
              </button>

              <button
                onClick={() => navigate('/admin/exams')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
                  currentRoute === '/admin/exams'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>Экзамены</span>
              </button>

              <button
                onClick={() => navigate('/admin/reports')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
                  currentRoute === '/admin/reports'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Отчёты</span>
              </button>
            </div>
          )}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Notifications Button */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 relative focus:outline-none transition-all"
              aria-label="Уведомления"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-[#111B2E] border border-slate-700 shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Уведомления ({notifications.length})
                  </span>
                  <span className="text-[11px] text-cyan-400 font-mono">
                    {unreadCount > 0 ? `${unreadCount} новых` : 'Все прочитаны'}
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Нет событий для отображения
                    </div>
                  ) : (
                    notifications.slice(0, 8).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => {
                          setShowNotifMenu(false);
                          if (currentUser.role === 'admin') navigate('/admin/reports');
                        }}
                        className="p-3 hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-xs font-medium text-slate-200">{notif.title}</p>
                          <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">
                            {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{notif.description}</p>
                      </div>
                    ))
                  )}
                </div>
                {currentUser.role === 'admin' && (
                  <div className="p-2 border-t border-slate-800 text-center">
                    <button
                      onClick={() => {
                        setShowNotifMenu(false);
                        navigate('/admin/reports');
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                    >
                      Перейти во входящие отчёты →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User selector button */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 transition-all text-left"
            >
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center font-bold text-xs">
                {currentUser.displayName.charAt(0)}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-200 leading-tight">
                  {currentUser.displayName.split(' ')[0]}
                </p>
                <p className="text-[10px] text-cyan-400 font-mono">
                  {currentUser.role === 'admin' ? 'Ментор' : 'Студент'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#111B2E] border border-slate-700 shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-800">
                  <p className="text-xs text-slate-400">Текущий профиль:</p>
                  <p className="text-sm font-semibold text-slate-100">{currentUser.displayName}</p>
                  <p className="text-xs text-cyan-400 font-mono">{currentUser.email}</p>
                </div>

                <div className="py-2">
                  <p className="px-4 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    Переключить пользователя:
                  </p>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleSwitchUser(u.id)}
                      className={`w-full px-4 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-800/60 transition-colors ${
                        u.id === currentUser.id ? 'text-cyan-400 font-semibold bg-cyan-500/10' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>{u.displayName}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        {u.role === 'admin' ? 'Ментор' : 'Студент'}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-slate-800 pt-2 px-2">
                  <button
                    onClick={handleResetData}
                    className="w-full px-3 py-1.5 text-left text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 rounded-md flex items-center space-x-2 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Сбросить данные к эталону</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 lg:hidden focus:outline-none"
            aria-label="Открыть мобильное меню"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-[#090F1C] px-4 pt-3 pb-6 space-y-2">
          <button
            onClick={() => {
              navigate('/dashboard');
              setMobileMenuOpen(false);
            }}
            className="w-full py-2 px-3 rounded-lg text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Дашборд
          </button>
          <button
            onClick={() => {
              navigate('/course');
              setMobileMenuOpen(false);
            }}
            className="w-full py-2 px-3 rounded-lg text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            18 Модулей курса
          </button>
          <button
            onClick={() => {
              navigate('/knowledge-map');
              setMobileMenuOpen(false);
            }}
            className="w-full py-2 px-3 rounded-lg text-left text-sm font-medium text-cyan-400 hover:bg-slate-800"
          >
            Карта знаний (Flight Route)
          </button>
          <button
            onClick={() => {
              navigate('/progress');
              setMobileMenuOpen(false);
            }}
            className="w-full py-2 px-3 rounded-lg text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Прогресс и пробелы
          </button>
          <button
            onClick={() => {
              navigate('/exam-preparation');
              setMobileMenuOpen(false);
            }}
            className="w-full py-2 px-3 rounded-lg text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Открытый банк экзаменов
          </button>
          <button
            onClick={() => {
              navigate('/homework');
              setMobileMenuOpen(false);
            }}
            className="w-full py-2 px-3 rounded-lg text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Домашние задания
          </button>
          {currentUser.role === 'admin' && (
            <button
              onClick={() => {
                navigate('/admin');
                setMobileMenuOpen(false);
              }}
              className="w-full py-2 px-3 rounded-lg text-left text-sm font-medium text-violet-400 hover:bg-slate-800"
            >
              Панель главного ментора
            </button>
          )}
        </div>
      )}
    </header>
  );
};

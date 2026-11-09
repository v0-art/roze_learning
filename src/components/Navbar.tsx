import React, { useEffect, useState } from 'react';
import { Bell, BookOpen, ChartNoAxesCombined, ChevronDown, ClipboardList, Compass, FileCheck2, FolderOpen, GraduationCap, LayoutDashboard, LogOut, Menu, Network, UserRound, Users, X } from 'lucide-react';
import { BrandMark } from './BrandMark';
import type { MessageItem } from '../types';
import { getCurrentUser, getNotifications, subscribeToDatabase } from '../services/storage';

interface NavbarProps { currentRoute: string; navigate: (route: string) => void }

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, navigate }) => {
  const [user, setUser] = useState(getCurrentUser());
  const [notifications, setNotifications] = useState(getNotifications());
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => subscribeToDatabase(() => { setUser(getCurrentUser()); setNotifications(getNotifications()); }), []);
  useEffect(() => {
    let active = true;
    const refresh = () => { void fetch('/api/messages/inbox').then(r => r.ok ? r.json() : []).then(items => { if (active) setMessages(items); }).catch(() => {}); };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('nexus-messages-updated', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('nexus-messages-updated', refresh); };
  }, [user.id]);
  useEffect(() => {
    if (!mobileOpen && !profileOpen && !notificationsOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMobileOpen(false); setProfileOpen(false); setNotificationsOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, profileOpen, notificationsOpen]);
  const incoming = messages.filter(m => m.recipientId === user.id);
  const links = user.role === 'admin' ? [
    {path: '/admin', label: 'Обзор'},
    {path: '/admin/content', label: 'Учебный план'},
    {path: '/admin/users', label: 'Ученики'},
    {path: '/admin/reports', label: 'Отчёты'},
    {path: '/admin/exams', label: 'Экзамены'},
    {path: '/admin/content/library', label: 'Библиотека'},
    {path: '/homework', label: 'ДЗ учеников'},
    {path: '/knowledge-map', label: 'Карта знаний'},
  ] : [
    {path: '/dashboard', label: 'Дашборд'},
    {path: '/course', label: 'Модули'},
    {path: '/knowledge-map', label: 'Карта знаний'},
    {path: '/progress', label: 'Прогресс'},
    {path: '/exam-preparation', label: 'Банк экзаменов'},
    {path: '/homework', label: 'ДЗ'},
  ];
  const linkIcons: Record<string, React.ElementType> = {
    '/admin':LayoutDashboard, '/admin/content':Network, '/admin/users':Users, '/admin/reports':FileCheck2,
    '/admin/exams':GraduationCap, '/admin/content/library':FolderOpen, '/dashboard':LayoutDashboard,
    '/course':BookOpen, '/knowledge-map':Compass, '/progress':ChartNoAxesCombined,
    '/exam-preparation':GraduationCap, '/homework':ClipboardList,
  };
  const go = (route: string) => { setMobileOpen(false); setProfileOpen(false); setNotificationsOpen(false); navigate(route); };
  const logout = async () => {
    setLoggingOut(true);
    try {
      const response = await fetch('/api/auth/logout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      if (!response.ok) throw new Error('Не удалось выйти. Попробуйте ещё раз.');
      window.location.replace('/');
    } catch (error) { alert(error instanceof Error ? error.message : 'Не удалось выйти.'); setLoggingOut(false); }
  };

  return <header data-role={user.role} className="app-navbar sticky top-0 z-40 w-full shrink-0 border-b border-slate-800 bg-[#110d1b]/95 text-slate-100">
    <div className="app-navbar-bar mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
      <button onClick={() => go(user.role === 'admin' ? '/admin' : '/dashboard')} className="flex shrink-0 items-center gap-2" aria-label="На главную">
        <span className="hidden min-[420px]:inline-flex"><BrandMark /></span>
        <span className="app-mobile-brand min-[420px]:hidden"><img src="/icon.png" alt=""/><span>rozephyr<span>.</span>learning</span></span>
      </button>
      {user.isDemo && <span className="rounded-md border border-amber-400/50 bg-amber-950/70 px-2 py-1 text-xs font-bold text-amber-200">ДЕМО · СИНТЕТИЧЕСКИЕ ДАННЫЕ</span>}
      <nav aria-label={user.role === 'admin' ? 'Навигация ментора' : 'Навигация ученика'} className="app-desktop-nav items-center gap-1">
        {links.map(link => <button key={link.path} onClick={() => go(link.path)} className={`rounded-lg px-2.5 py-2 text-sm ${currentRoute === link.path ? 'bg-cyan-950 text-cyan-300' : 'text-slate-300 hover:bg-slate-800'}`}>{link.label}</button>)}
      </nav>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <div className="relative">
          <button onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); setMobileOpen(false); }} aria-expanded={notificationsOpen} className="rounded-lg p-2 hover:bg-slate-800" aria-label="Уведомления"><Bell size={19} />{(incoming.some(m => !m.readAt) || (user.role === 'admin' && notifications.some(n => n.status === 'unread'))) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-cyan-400" />}</button>
          {notificationsOpen && <div className="absolute right-0 top-full z-50 mt-2 max-h-80 w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-slate-700 bg-[#20172f] p-3 shadow-xl">
            <p className="mb-2 text-xs font-semibold text-slate-400">Уведомления</p>
            {incoming.slice(0, 8).map(m => <button key={m.id} onClick={() => go('/profile')} className="block w-full border-t border-slate-700 p-2 text-left text-sm"><span className="block text-slate-100">{!m.readAt ? '● ' : ''}{m.subject || 'Сообщение'}</span><span className="line-clamp-2 text-slate-400">{m.content}</span></button>)}
            {user.role === 'admin' && notifications.slice(0, 8).map(n => <button key={n.id} onClick={() => go('/admin/reports')} className="block w-full border-t border-slate-800 p-2 text-left text-xs"><span className="block text-slate-100">{n.title}</span><span className="text-slate-400">{n.description}</span></button>)}
            {incoming.length === 0 && (user.role !== 'admin' || notifications.length === 0) && <p className="text-sm text-slate-400">Нет уведомлений</p>}
          </div>}
        </div>
        <div className="relative">
          <button onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); setMobileOpen(false); }} className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-2 text-left sm:px-3" aria-label="Профиль" aria-expanded={profileOpen}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : <UserRound size={20} />}<span className="hidden max-w-32 truncate text-sm font-semibold sm:inline">{user.displayName}</span><span className="hidden text-sm text-cyan-400 sm:inline">{user.role === 'admin' ? 'Ментор' : 'Ученик'}</span><ChevronDown size={14} className="hidden sm:block" />
          </button>
          {profileOpen && <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-700 bg-[#20172f] p-3 shadow-xl">
            <p className="truncate text-sm font-semibold">{user.displayName}</p><p className="mb-3 text-xs text-slate-400">{user.role === 'admin' ? 'Главный ментор' : 'Ученик'}</p>
            <button onClick={() => go('/profile')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"><UserRound size={16} /> Личный кабинет</button>
            <button onClick={logout} disabled={loggingOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-slate-800 disabled:opacity-50"><LogOut size={16} /> {loggingOut ? 'Выход…' : 'Выйти'}</button>
          </div>}
        </div>
        <button onClick={() => { setMobileOpen(!mobileOpen); setProfileOpen(false); setNotificationsOpen(false); }} className="app-menu-toggle" aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'} aria-controls="app-mobile-navigation" aria-expanded={mobileOpen}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
    </div>
    <nav aria-label="Быстрый доступ" className="app-mobile-quick">{(user.role === 'admin' ? ['/admin','/admin/content','/admin/users','/admin/reports','/knowledge-map'] : ['/dashboard','/course','/knowledge-map','/progress','/homework']).map(path => {
      const link = links.find(item => item.path === path); if (!link) return null;
      const Icon = linkIcons[path] || Compass; const active = currentRoute === path;
      const label = path === '/knowledge-map' ? 'Карта' : path === '/admin/content' ? 'План' : path === '/dashboard' ? 'Главная' : path === '/homework' ? 'ДЗ' : link.label;
      return <button key={path} onClick={() => go(path)} aria-current={active ? 'page' : undefined} aria-label={link.label} className={`app-mobile-quick-item ${active ? 'is-active' : ''}`}><Icon size={19}/><span>{label}</span></button>;
    })}</nav>
    {mobileOpen && <div className="app-mobile-overlay">
      <button className="app-mobile-backdrop" aria-label="Закрыть навигацию" onClick={() => setMobileOpen(false)} />
      <nav id="app-mobile-navigation" aria-label="Мобильная навигация" className="app-mobile-drawer">
        <div className="app-mobile-drawer-heading"><div><p>НАВИГАЦИЯ</p><strong>{user.role === 'admin' ? 'Кабинет ментора' : 'Кабинет ученика'}</strong></div><span>{user.role === 'admin' ? 'Ментор' : 'Ученик'}</span></div>
        <div className="app-mobile-links">{links.map(link => { const Icon = linkIcons[link.path] || Compass; const active = currentRoute === link.path; return <button key={link.path} onClick={() => go(link.path)} aria-current={active ? 'page' : undefined} className={`app-mobile-link ${active ? 'is-active' : ''}`}><span className="app-mobile-link-icon"><Icon size={18}/></span><span>{link.label}</span>{active && <span className="app-mobile-active-dot"/>}</button>; })}</div>
        <div className="app-mobile-account"><p>ЛИЧНОЕ</p><button onClick={() => go('/profile')} className="app-mobile-link"><span className="app-mobile-link-icon"><UserRound size={18}/></span><span>Личный кабинет</span></button><button onClick={logout} disabled={loggingOut} className="app-mobile-link app-mobile-logout"><span className="app-mobile-link-icon"><LogOut size={18}/></span><span>{loggingOut ? 'Выход…' : 'Выйти'}</span></button></div>
      </nav>
    </div>}
  </header>;
};

import React, { useEffect, useState } from 'react';

type Account = {userId: string; username: string; displayName: string; active: boolean};

export const AdminUsersView: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<{name:string; attempts:any[]; homework:any[]; gaps:any[]} | null>(null);
  const openProfile = async (account: Account) => {
    const response = await fetch('/api/db');
    if (!response.ok) { setMessage('Не удалось загрузить результаты ученика.'); return; }
    const db = await response.json();
    setProfile({name:account.displayName, attempts:db.lessonAttempts.filter((a:any) => a.userId === account.userId), homework:db.homework.filter((h:any) => h.userId === account.userId), gaps:db.knowledgeGaps.filter((g:any) => g.userId === account.userId && g.status === 'needs-review')});
  };
  const load = async () => {
    const response = await fetch('/api/mentor/users');
    if (!response.ok) throw new Error('Не удалось получить список пользователей.');
    setAccounts(await response.json());
  };
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    const response = await fetch('/api/mentor/users', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, displayName, password})});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(result.error || 'Не удалось создать пользователя.'); return; }
    setUsername(''); setDisplayName(''); setPassword(''); setMessage('Пользователь создан.'); await load();
  };
  const archive = async (account: Account) => {
    if (!window.confirm(`Удалить ${account.displayName} из списка? Доступ будет закрыт, история обучения сохранится.`)) return;
    const response = await fetch('/api/mentor/users/archive', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:account.userId})});
    if (!response.ok) { setMessage('Не удалось удалить ученика.'); return; }
    setProfile(null); setMessage('Ученик удалён из списка, доступ закрыт; история сохранена.'); await load();
  };
  const update = async (userId: string, change: {active?: boolean; password?: string}) => {
    const response = await fetch('/api/mentor/users/update', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId, ...change})});
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Изменение сохранено.' : result.error || 'Ошибка сохранения.');
    if (response.ok) await load();
  };
  return <div className="max-w-4xl mx-auto p-6 space-y-6 text-slate-200">
    <h1 className="text-2xl font-bold">Учётные записи учеников</h1>
    <form onSubmit={create} className="rounded-xl bg-slate-900 border border-slate-700 p-5 grid gap-3">
      <h2 className="font-semibold">Добавить ученика</h2>
      <label>Имя<input required maxLength={100} value={displayName} onChange={e => setDisplayName(e.target.value)} className="block w-full rounded bg-slate-800 p-2" /></label>
      <label>Логин<input required pattern="[a-z][a-z0-9_-]{2,31}" value={username} onChange={e => setUsername(e.target.value)} className="block w-full rounded bg-slate-800 p-2" /></label>
      <label>Временный пароль (не менее 16 символов)<input required minLength={16} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="block w-full rounded bg-slate-800 p-2" /></label>
      <button className="rounded bg-cyan-500 px-4 py-2 text-slate-950 font-semibold">Создать</button>
    </form>
    {message && <p role="status">{message}</p>}
    {profile && <section className="rounded-xl border border-violet-400/40 bg-slate-900 p-5" aria-label="Профиль ученика">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{profile.name}</h2><p className="text-sm text-slate-400">Результаты уроков — самоотчёты до подтверждения ментором.</p></div><button onClick={() => setProfile(null)} className="text-sm text-slate-300">Закрыть</button></div>
      <div className="mt-4 flex flex-wrap gap-5 text-sm"><span>Уроков: {profile.attempts.length}</span><span>ДЗ: {profile.homework.length}</span><span>Открытых пробелов: {profile.gaps.length}</span></div>
      <ul className="mt-4 space-y-2">{profile.attempts.map((attempt:any) => <li key={attempt.id} className="rounded-lg border border-slate-700 p-3 text-sm">{attempt.lessonId} · {attempt.score}/{attempt.maxScore} · {attempt.mentorConfirmed ? 'Подтверждено ментором' : 'Самоотчёт'}</li>)}</ul>
    </section>}
    <div className="space-y-3">{accounts.map(account => <div key={account.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div><p>{account.displayName}</p><p className="text-sm text-slate-400">{account.username} · {account.active ? 'Доступен' : 'Отключён'}</p></div>
      <div className="flex gap-3"><button className="text-rose-300" onClick={() => void archive(account)}>Удалить</button><button className="text-violet-300" onClick={() => void openProfile(account)}>Результаты</button><button className="text-cyan-300" onClick={() => update(account.userId, {active: !account.active})}>{account.active ? 'Отключить доступ' : 'Включить доступ'}</button>
      <button className="text-cyan-300" onClick={() => {const value = window.prompt('Новый пароль (не менее 16 символов):'); if (value) void update(account.userId, {password: value});}}>Сменить пароль</button></div>
    </div>)}</div>
  </div>;
};

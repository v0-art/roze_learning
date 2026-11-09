import React, { useEffect, useRef, useState } from 'react';
import { Camera, Mail, Send, UserRound } from 'lucide-react';
import { getAllUsers, getCurrentUser, syncDatabaseFromServer } from '../services/storage';
import type { MessageItem, User } from '../types';

const api = async (path: string, body: unknown) => {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Не удалось сохранить изменения.'); }
};

async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Выберите PNG, JPEG или WebP размером до 10 МБ.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.width || !image.height) throw new Error('Не удалось прочитать фотографию.');
    const canvas = document.createElement('canvas');
    const size = Math.min(image.width, image.height), scale = Math.min(1, 384 / size);
    canvas.width = Math.max(1, Math.round(size * scale)); canvas.height = canvas.width;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Не удалось обработать фотографию.');
    ctx.drawImage(image, (image.width-size)/2, (image.height-size)/2, size, size, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export const ProfileView: React.FC = () => {
  const [user, setUser] = useState<User>(getCurrentUser());
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [recipientId, setRecipientId] = useState('');
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState(getAllUsers());
  const input = useRef<HTMLInputElement | null>(null);
  const students = users.filter(u => u.role === 'student');

  const refresh = async () => {
    const response = await fetch('/api/messages/inbox');
    if (!response.ok) throw new Error('Не удалось загрузить сообщения.');
    setMessages(await response.json());
  };
  useEffect(() => {
    void syncDatabaseFromServer().then(() => { setUser(getCurrentUser()); setUsers(getAllUsers()); });
    void refresh().catch(() => setNotice('Не удалось загрузить сообщения.'));
    const timer = window.setInterval(() => { void refresh().catch(() => {}); }, 15000);
    return () => window.clearInterval(timer);
  }, []);
  const photoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setNotice('');
    try { const avatar = await preparePhoto(file); await api('/api/profile', {avatar}); await syncDatabaseFromServer(); setUser(getCurrentUser()); setNotice('Фотография сохранена.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Ошибка загрузки.'); }
    finally { setBusy(false); event.target.value = ''; }
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try { await api('/api/messages', {recipientId, content}); setContent(''); await refresh(); window.dispatchEvent(new Event('nexus-messages-updated')); setNotice('Сообщение отправлено.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Ошибка отправки.'); }
    finally { setBusy(false); }
  };
  const markRead = async (message: MessageItem) => {
    try { await api('/api/messages/read', {id: message.id}); await refresh(); window.dispatchEvent(new Event('nexus-messages-updated')); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Ошибка.'); }
  };
  return <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 text-slate-100">
    <h1 className="text-2xl sm:text-3xl font-bold">Личный кабинет</h1>
    <section className="rounded-2xl border border-slate-800 bg-[#20172f] p-6 flex flex-wrap items-center gap-5">
      <div className="h-24 w-24 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center border border-slate-700">{user.avatarUrl ? <img src={user.avatarUrl} alt="Фото профиля" className="h-full w-full object-cover" /> : <UserRound size={42} className="text-slate-400" />}</div>
      <div className="space-y-2"><h2 className="text-xl font-semibold">{user.displayName}</h2><p className="text-sm text-slate-400">{user.role === 'admin' ? 'Главный ментор' : 'Ученик'}</p>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={photoChange} className="hidden" aria-label="Выбрать фотографию" />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:border-cyan-400 disabled:opacity-50"><Camera size={16}/> Изменить фото</button>
      </div>
    </section>
    {notice && <p role="status" className="rounded-lg border border-cyan-800 bg-cyan-950 px-4 py-3 text-sm">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <form onSubmit={send} className="rounded-2xl border border-slate-800 bg-[#20172f] p-6 space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Send size={19}/> {user.role === 'admin' ? 'Написать ученику' : 'Написать ментору'}</h2>
        {user.role === 'admin' && <label className="block text-sm text-slate-300">Получатель<select required value={recipientId} onChange={e => setRecipientId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-3"><option value="">Выберите ученика</option>{students.map(student => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label>}
        <label className="block text-sm text-slate-300">Сообщение<textarea required maxLength={4000} rows={5} value={content} onChange={e => setContent(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-slate-100" /></label>
        <button disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">Отправить</button>
      </form>
      <section className="rounded-2xl border border-slate-800 bg-[#20172f] p-6 space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Mail size={19}/> Сообщения и уведомления</h2>
        {messages.length === 0 ? <p className="text-sm text-slate-400">Сообщений пока нет.</p> : <div className="space-y-3 max-h-[36rem] overflow-auto">{messages.map(message => {
          const incoming = message.recipientId === user.id;
          return <article key={message.id} className={`rounded-xl border p-4 ${incoming && !message.readAt ? 'border-cyan-600 bg-cyan-950/40' : 'border-slate-700 bg-slate-900/70'}`}>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>{incoming ? `От: ${message.senderName}` : `Отправлено: ${users.find(u => u.id === message.recipientId)?.displayName || 'ментору'}`}</span><time>{new Date(message.createdAt).toLocaleString('ru-RU')}</time></div>
            <p className="mt-2 text-sm font-semibold text-cyan-300">{message.subject}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">{message.content}</p>
            <div className="mt-3 flex flex-wrap gap-4">{incoming && !message.readAt && <button onClick={() => markRead(message)} className="text-xs text-cyan-300 hover:underline">Отметить прочитанным</button>}{incoming && user.role === 'admin' && <button onClick={() => { setRecipientId(message.senderId); }} className="text-xs text-cyan-300 hover:underline">Ответить ученику</button>}</div>
          </article>;
        })}</div>}
      </section>
    </div>
  </div>;
};

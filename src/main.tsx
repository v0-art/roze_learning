import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { BrandMark } from './components/BrandMark';
import { quotes } from './data/welcomeQuotes';
import { LandingView } from './views/LandingView';
import { PlatformAdminView } from './views/PlatformAdminView';
import { RelationalPortal } from './views/RelationalPortal';
import './index.css';
import { syncDatabaseFromServer } from './services/storage';

function chooseQuote() {
  let previous = -1;
  try { previous = Number(sessionStorage.getItem('roze-last-quote') ?? -1); } catch { /* storage may be unavailable */ }
  const available = quotes.map((_, index) => index).filter(index => index !== previous);
  const index = available[Math.floor(Math.random() * available.length)];
  try { sessionStorage.setItem('roze-last-quote', String(index)); } catch { /* storage may be unavailable */ }
  return quotes[index];
}
function Bootstrap() {
  const [state, setState] = useState<'loading' | 'landing' | 'login' | 'welcome' | 'ready'>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [screenFading, setScreenFading] = useState(false);
  const [sessionRole, setSessionRole] = useState<'admin' | 'student' | null>(null);
  const [relational, setRelational] = useState(false);
  const [relationalIdentity, setRelationalIdentity] = useState<{id:string;roles:string[]}|null>(null);
  const [quote, setQuote] = useState(quotes[0]);

  useEffect(() => { void (async()=>{
    try {
      const runtime=await fetch('/api/runtime',{cache:'no-store'}).then(r=>r.ok?r.json():null);
      if(runtime?.storage==='relational'){
        setRelational(true);const response=await fetch('/api/relational/auth/me',{cache:'no-store'});const identity=response.ok?await response.json():null;
        if(identity?.roles?.includes('administrator')&&!identity.roles.includes('mentor')&&!identity.roles.includes('student')){window.location.replace('/platform');return;}
        setRelationalIdentity(identity);setSessionRole(identity?(identity.roles.includes('mentor')?'admin':'student'):null);
        setState(window.location.pathname==='/'?'landing':identity?'ready':'login');return;
      }
      const db=await syncDatabaseFromServer(),user=db?.users.find(item=>item.id===db.currentUserId);
      setSessionRole(user?.role==='admin'?'admin':user?'student':null);setState(window.location.pathname==='/'?'landing':db?'ready':'login');
    }catch{setState(window.location.pathname==='/'?'landing':'login')}
  })(); }, []);

  useEffect(() => {
    const handlePop = () => {
      if (window.location.pathname === '/') setState('landing');
      else if (window.location.pathname === '/login' && !sessionRole) setState('login');
      else if (sessionRole) setState('ready');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [sessionRole]);

  const loadCaptcha = async () => {
    setCaptchaLoading(true); setCaptchaToken(''); setCaptchaAnswer('');
    try {
      const response = await fetch(relational?'/api/relational/captcha':'/api/captcha', {cache:'no-store'});
      const body = await response.json();
      if (!response.ok || typeof body.svg !== 'string' || typeof body.token !== 'string') throw new Error(body.error || 'Не удалось загрузить проверку.');
      setCaptchaSvg(body.svg); setCaptchaToken(body.token);
    } catch (e) { setCaptchaSvg(''); setError(e instanceof Error ? e.message : 'Не удалось загрузить проверку.'); }
    finally { setCaptchaLoading(false); }
  };
  useEffect(() => { if (state === 'login') void loadCaptcha(); }, [state,relational]);

  const smoothSwitch = (action: () => void) => {
    if (screenFading) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { action(); return; }
    setScreenFading(true);
    window.setTimeout(() => { action(); setScreenFading(false); }, 240);
  };
  const openSignIn = () => smoothSwitch(() => {
    if (sessionRole) {
      window.history.pushState(null, '', sessionRole === 'admin' ? (relational?'/mentor':'/admin') : '/dashboard');
      setState('ready');
    } else {
      window.history.pushState(null, '', '/login');
      setState('login');
    }
    window.scrollTo({top: 0});
  });
  const openLanding = () => smoothSwitch(() => { window.history.pushState(null, '', '/'); setState('landing'); setError(''); window.scrollTo({top: 0}); });

  useEffect(() => {
    if (state !== 'welcome') return;
    const timer = window.setTimeout(() => setState('ready'), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 6000 : 10000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await fetch(relational?'/api/relational/auth/login':'/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password, captcha:captchaAnswer, captchaToken})});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Не удалось войти.');
      if(relational){
        const me=await fetch('/api/relational/auth/me',{cache:'no-store'});if(!me.ok)throw new Error('Не удалось загрузить профиль.');const identity=await me.json();
        if(identity.roles.includes('administrator')&&!identity.roles.includes('mentor')&&!identity.roles.includes('student')){window.location.replace('/platform');return;}
        setRelationalIdentity(identity);setPassword('');const role=identity.roles.includes('mentor')?'admin':'student';setSessionRole(role);window.history.replaceState(null,'',role==='admin'?'/mentor':'/dashboard');if(role==='admin')setState('ready');else{setQuote(chooseQuote());setState('welcome')}return;
      }
      const db = await syncDatabaseFromServer();if (!db) throw new Error('Не удалось загрузить профиль.');
      setPassword('');
      setSessionRole(body.role === 'admin' ? 'admin' : 'student');
      window.history.replaceState(null, '', body.role === 'admin' ? '/admin' : '/dashboard');
      if (body.role === 'admin') setState('ready');
      else { setQuote(chooseQuote()); setState('welcome'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка входа.'); void loadCaptcha(); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="min-h-screen bg-[#110d1b] p-8 text-slate-300">Подключение к Rozephyr Learning…</div>;
  if (state === 'landing') return <div className={`entry-transition ${screenFading ? 'is-leaving' : ''}`}><LandingView onSignIn={openSignIn} /></div>;
  if (state === 'ready') return relational && relationalIdentity ? <RelationalPortal identity={relationalIdentity} onLogout={()=>{setRelationalIdentity(null);setSessionRole(null);window.history.replaceState(null,'','/');setState('landing')}} /> : <App />;
  if (state === 'welcome') return <main className="welcome-screen" aria-live="polite">
    <div className="welcome-quote">
      {quote.portrait && <img src={quote.portrait} className="welcome-portrait" style={{objectPosition: quote.position || 'center 20%'}} alt={`Портрет: ${quote.author}`} />}
      <p>«{quote.text}»</p><span>— {quote.author}</span>
      {quote.source && <a className="welcome-credit" href={quote.source} target="_blank" rel="noreferrer">{quote.credit}</a>}
    </div>
    <button className="welcome-skip" onClick={() => setState('ready')}>Пропустить</button>
  </main>;
  return <main className={`entry-transition ${screenFading ? 'is-leaving' : ''} relative flex min-h-screen items-center justify-center overflow-hidden bg-[#110d1b] p-4 text-slate-100`} style={{backgroundImage: 'radial-gradient(ellipse at 15% 20%, #49316c 0%, transparent 45%), radial-gradient(ellipse at 85% 80%, #163a55 0%, transparent 40%)'}}>
    <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-violet-300/20 bg-[#171022]/90 shadow-2xl lg:grid-cols-2">
    <section className="relative hidden min-h-[580px] flex-col justify-between overflow-hidden border-r border-violet-300/10 p-10 lg:flex">
      <BrandMark size="large" showDomain />
      <img src="/icon.png" alt="" className="absolute right-[-70px] top-[80px] h-[430px] w-[430px] object-contain opacity-40" />
      <div className="relative z-10"><h2 className="max-w-sm text-4xl font-bold leading-tight">Знания, которые открывают новые возможности</h2><p className="mt-5 max-w-sm leading-relaxed text-slate-300">Учебные материалы, карта знаний и связь с ментором — в одном пространстве.</p></div>
      <p className="relative text-sm text-slate-400">Ваш путь в кибербезопасности и телекоммуникациях</p>
    </section>
    <form onSubmit={login} className="w-full space-y-5 p-7 sm:p-12 lg:self-center">
      <button type="button" onClick={openLanding} className="text-sm text-violet-200 hover:text-white">← На главную</button>
      <div><h1 className="text-2xl font-bold">Вход в кабинет</h1><p className="mt-2 text-sm text-slate-400">Ваше пространство для обучения</p></div>
      <label className="block text-sm text-slate-300">Логин<input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-white" /></label>
      <label className="block text-sm text-slate-300">Пароль<input value={password} onChange={e => setPassword(e.target.value)} required type="password" autoComplete="current-password" className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-white" /></label>
      <div className="space-y-2">
        <label htmlFor="login-captcha" className="block text-sm text-slate-300">Код с картинки</label>
        <div className="flex items-center gap-3"><div className="flex h-20 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-[#20172f]">{captchaSvg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaSvg)}`} alt="Код для проверки" className="h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">{captchaLoading ? 'Загружаем изображение…' : 'Изображение недоступно'}</span>}</div><button type="button" disabled={captchaLoading || busy} onClick={()=>{setError('');void loadCaptcha();}} aria-label="Обновить код" title="Обновить код" className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">↻</button></div>
        <input id="login-captcha" value={captchaAnswer} onChange={e=>setCaptchaAnswer(e.target.value)} required autoComplete="off" maxLength={32} className="block w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-white" />
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <button disabled={busy || captchaLoading || !captchaToken} className="w-full rounded-lg bg-cyan-500 p-3 font-bold text-slate-950 disabled:opacity-50">{busy ? 'Вход…' : 'Войти'}</button>
    </form>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(window.location.pathname === '/platform' ? <PlatformAdminView /> : <Bootstrap />);

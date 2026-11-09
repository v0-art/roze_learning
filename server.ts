/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import svgCaptcha from 'svg-captcha';
import { validateStructuredReport } from './src/core/reportValidator';
import { assembleLessonPrompt } from './src/core/promptEngine';
import { classifyScore } from './src/core/gradingEngine';
import { graphDiff, validateModuleGraph } from './src/core/moduleGraph';
import 'dotenv/config';
import {createPostgresStore} from './src/server/postgres-sync';
import pg from 'pg';
import {createRelationalApi} from './src/server/relational-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = process.env.NEXUS_DATA_FILE ? path.resolve(process.env.NEXUS_DATA_FILE) : path.resolve(__dirname, 'data', 'nexus_academy.json');
const relationalOnly = process.env.NEXUS_STORAGE === 'relational';
if(relationalOnly && !process.env.NEXUS_RELATIONAL_DATABASE_URL)throw new Error('Для реляционного режима не задан NEXUS_RELATIONAL_DATABASE_URL.');
const postgresStore = process.env.NEXUS_STORAGE === 'postgres' ? createPostgresStore(process.env.NEXUS_DATABASE_URL || (() => { throw new Error('Не задан NEXUS_DATABASE_URL.'); })()) : null;
const ASSETS_DIR = path.resolve(__dirname, 'public', 'assets', 'aistudio');

// Ensure data directory exists
if (!relationalOnly && !fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Helpers for reading/writing DB
function readDatabase(): any {
  try {
    if (postgresStore) return postgresStore.read();
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading database file:', err);
  }
  return null;
}

function writeDatabase(db: any): boolean {
  try {
    if (postgresStore) return postgresStore.write(db);
    const tmpFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Error writing database file:', err);
    return false;
  }
}

// Reject stale whole-CMS writes so one editor cannot silently erase another's changes.
function contentRevision(db: any): string {
  const keys = ['modules', 'topics', 'lessons', 'skills', 'relations', 'exams', 'libraryFiles', 'graphNodes', 'graphEdges'];
  return crypto.createHash('sha256').update(JSON.stringify(keys.map(key => db[key] || []))).digest('hex');
}

function addMentorMessage(db: any, recipientId: string, subject: string, content: string) {
  if (!content.trim()) return;
  const mentor = db.users.find((u: any) => u.id === 'admin-mentor');
  db.messages ||= [];
  db.messages.unshift({id: crypto.randomUUID(), senderId: 'admin-mentor', senderName: mentor?.displayName || 'Главный ментор', senderRole: 'admin', recipientId, subject, content, resolved: false, createdAt: new Date().toISOString()});
}

async function startServer() {
  if (postgresStore) postgresStore.read(); // Fail closed before listening if PostgreSQL is unavailable.
  const app = express();
  app.get('/api/runtime',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({storage:relationalOnly?'relational':'legacy'});});

  // Opt-in only while legacy routes are migrated. Separate cookie and path prevent
  // either authentication system from being treated as identity by the other.
  if(process.env.NEXUS_RELATIONAL_DATABASE_URL){
    const relationalPool=new pg.Pool({connectionString:process.env.NEXUS_RELATIONAL_DATABASE_URL,connectionTimeoutMillis:10000});
    if(relationalOnly)await relationalPool.query('SELECT 1 FROM platform_accounts LIMIT 1');
    app.use('/api/relational',express.json({limit:'12mb'}),createRelationalApi(relationalPool,{cookieName:'rozephyr_relational_session',cookiePath:'/api/relational',secureCookie:process.env.NEXUS_COOKIE_SECURE==='true'}));
  }
  if(relationalOnly){
    app.get('/api/health',(_req,res)=>res.json({status:'ok',storage:'relational'}));
    app.use(['/api','/data','/@fs','/assets/aistudio'],(_req,res)=>res.status(410).json({error:'Этот прежний маршрут не доступен в реляционном режиме.'}));
  }

  // Browser authentication uses a revocable, server-side session. Basic authentication
  // remains available to non-browser API clients for backwards compatibility.
  const attempts = new Map<string, {count: number; until: number}>();
  const sessions = new Map<string, {id: string; role: 'admin' | 'student'; username: string; expiresAt: number}>();
  const captchas = new Map<string, {answer: Buffer; ip: string; expiresAt: number}>();
  const captchaRequests = new Map<string, {count:number; until:number}>();
  const sessionCookie = 'nexus_session';
  const cookieOptions = {httpOnly: true, sameSite: 'strict' as const, secure: process.env.NEXUS_COOKIE_SECURE === 'true', path: '/'};
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  const credentialsConfigured = () => !!process.env.NEXUS_MENTOR_PASSWORD && !!process.env.NEXUS_STUDENT_PASSWORD && process.env.NEXUS_MENTOR_PASSWORD.length >= 16 && process.env.NEXUS_STUDENT_PASSWORD.length >= 16 && process.env.NEXUS_MENTOR_PASSWORD !== process.env.NEXUS_STUDENT_PASSWORD;
  const sameOrigin = (req: express.Request) => {
    try { return !!req.get('origin') && !!req.get('host') && new URL(req.get('origin')!).host === req.get('host'); } catch { return false; }
  };
  const authenticate = (name: string, password: string): {id: string; role: 'admin' | 'student'; username: string} | undefined => {
    const defaults: Record<string, {password: string | undefined; role: 'admin' | 'student'; id: string}> = {
      mentor: {password: process.env.NEXUS_MENTOR_PASSWORD, role: 'admin', id: 'admin-mentor'},
      student: {password: process.env.NEXUS_STUDENT_PASSWORD, role: 'student', id: 'student-alexey'},
    };
    const configured = Object.hasOwn(defaults, name) ? defaults[name] : undefined;
    if (configured && crypto.timingSafeEqual(digest(password), digest(configured.password || ''))) return {id: configured.id, role: configured.role, username: name};
    const account = readDatabase()?.authAccounts?.find((entry: any) => entry.username === name && entry.active === true);
    if (account && typeof account.salt === 'string' && typeof account.passwordHash === 'string') {
      try { const actual = crypto.scryptSync(password, Buffer.from(account.salt, 'hex'), 64); const expected = Buffer.from(account.passwordHash, 'hex'); if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return {id: account.userId, role: account.role, username: name}; } catch { /* reject invalid credentials */ }
    }
    return undefined;
  };
  const cookieValue = (req: express.Request) => (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
  const getSession = (req: express.Request) => {
    const token = cookieValue(req); const session = token ? sessions.get(token) : undefined;
    if (!session) return undefined;
    if (session.expiresAt <= Date.now()) { sessions.delete(token!); return undefined; }
    if (session.username !== 'mentor' && session.username !== 'student' && !readDatabase()?.authAccounts?.some((a: any) => a.userId === session.id && a.active === true)) { sessions.delete(token!); return undefined; }
    return session;
  };
  app.get('/api/captcha', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const now = Date.now(), ip = req.ip || 'unknown';
    for (const [token, item] of captchas) if (item.expiresAt <= now) captchas.delete(token);
    for (const [key, item] of captchaRequests) if (item.until <= now) captchaRequests.delete(key);
    const current = captchaRequests.get(ip);
    if (current && current.count >= 40) return res.status(429).json({error:'Слишком много запросов. Повторите позже.'});
    if (captchas.size >= 5000) return res.status(503).json({error:'Сервис проверки временно занят.'});
    captchaRequests.set(ip, {count:(current?.count || 0)+1, until:current?.until || now+10*60_000});
    const captcha = svgCaptcha.create({size:6, ignoreChars:'0o1i', noise:2, color:false, inverse:true, width:250, height:80, fontSize:60});
    const token = crypto.randomBytes(32).toString('hex');
    captchas.set(token, {answer:digest(captcha.text.toLowerCase()), ip, expiresAt:now+5*60_000});
    res.json({svg:captcha.data, token});
  });
  app.post('/api/auth/login', express.json({limit: '8kb'}), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!credentialsConfigured()) return res.status(503).json({error: 'Настройте пароли в окружении сервера.'});
    if (!sameOrigin(req) || !req.is('application/json')) return res.sendStatus(403);
    const ip = req.ip || 'unknown', limit = attempts.get(ip);
    if (limit && limit.until > Date.now() && limit.count >= 10) return res.status(429).json({error: 'Слишком много попыток входа. Повторите позже.'});
    if (typeof req.body?.username !== 'string' || typeof req.body?.password !== 'string' || req.body.username.length > 64 || req.body.password.length > 256) return res.status(400).json({error: 'Укажите логин и пароль.'});
    const token = typeof req.body?.captchaToken === 'string' ? req.body.captchaToken : '';
    const captcha = captchas.get(token);
    if (token) captchas.delete(token);
    const answer = typeof req.body?.captcha === 'string' && req.body.captcha.length <= 32 ? req.body.captcha.trim().toLowerCase() : '';
    if (!captcha || captcha.ip !== ip || captcha.expiresAt <= Date.now() || !answer || !crypto.timingSafeEqual(captcha.answer, digest(answer))) {
      const current = limit && limit.until > Date.now() ? limit : {count:0, until:Date.now()+15*60_000}; current.count++; attempts.set(ip,current);
      return res.status(400).json({error:'Неверный или устаревший код с картинки. Попробуйте снова.'});
    }
    const identity = authenticate(req.body.username, req.body.password);
    if (!identity) {
      const current = limit && limit.until > Date.now() ? limit : {count: 0, until: Date.now() + 15 * 60_000}; current.count++; attempts.set(ip, current);
      return res.status(401).json({error: 'Неверный логин или пароль.'});
    }
    attempts.delete(ip);
    const old = cookieValue(req); if (old) sessions.delete(old);
    for (const [key, session] of sessions) if (session.expiresAt <= Date.now()) sessions.delete(key);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionToken, {...identity, expiresAt: Date.now() + 12 * 60 * 60_000});
    res.cookie(sessionCookie, sessionToken, {...cookieOptions, maxAge: 12 * 60 * 60_000});
    res.json({role: identity.role});
  });
  app.post('/api/auth/logout', (req, res) => {
    if (!sameOrigin(req) || !req.is('application/json')) return res.sendStatus(403);
    const token = cookieValue(req); if (token) sessions.delete(token);
    res.clearCookie(sessionCookie, cookieOptions);
    res.setHeader('Cache-Control', 'no-store');
    res.json({success: true});
  });
  app.use((req, res, next) => {
    const requestPath = req.path.toLowerCase();
    if (!requestPath.startsWith('/api/') && !requestPath.startsWith('/assets/aistudio/') && !requestPath.startsWith('/data/') && !requestPath.startsWith('/@fs/')) return next();
    if (requestPath === '/api/health') return next();
    if (requestPath.startsWith('/data/') || requestPath.startsWith('/@fs/')) return res.sendStatus(404);
    if (!credentialsConfigured()) return res.status(503).send('Настройте разные пароли длиной не менее 16 символов.');
    let identity = getSession(req);
    if (!identity && !req.headers['sec-fetch-site'] && req.headers.authorization?.startsWith('Basic ')) {
      const ip = req.ip || 'unknown', limit = attempts.get(ip);
      if (limit && limit.until > Date.now() && limit.count >= 10) return res.status(429).json({error: 'Слишком много попыток входа.'});
      const raw = Buffer.from(req.headers.authorization.slice(6), 'base64').toString('utf8'); const separator = raw.indexOf(':');
      const apiIdentity = separator >= 0 ? authenticate(raw.slice(0, separator), raw.slice(separator + 1)) : undefined;
      if (apiIdentity) { identity = {...apiIdentity, expiresAt: 0}; attempts.delete(ip); }
      else { const current = limit && limit.until > Date.now() ? limit : {count: 0, until: Date.now() + 15 * 60_000}; current.count++; attempts.set(ip, current); }
    }
    if (!identity) { res.setHeader('Cache-Control', 'no-store'); return res.status(401).json({error: 'Требуется вход.'}); }
    if (req.method !== 'GET' && req.method !== 'HEAD' && (!sameOrigin(req) || !req.is('application/json'))) return res.sendStatus(403);
    (req as any).identity = identity;
    res.setHeader('Cache-Control', 'no-store');
    if (identity.role !== 'admin' && requestPath.startsWith('/assets/aistudio/')) return res.sendStatus(403);
    if (identity.role !== 'admin' && requestPath.startsWith('/api/') && !['/api/db', '/api/reports', '/api/snapshots', '/api/homework', '/api/assessments', '/api/profile', '/api/messages', '/api/messages/read', '/api/messages/inbox', '/api/module-graph'].includes(requestPath)) return res.sendStatus(403);
    if (identity.role !== 'admin' && requestPath === '/api/db' && req.method !== 'GET') return res.sendStatus(403);
    next();
  });

  app.use('/api/db', express.json({ limit: '20mb' }));
  app.use('/api/library/save', express.json({limit: '12mb'}));
  app.use(express.json({ limit: '2mb' }));

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // 2. Full DB Read
  app.get('/api/db', (req, res) => {
    const db = readDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    const user = (req as any).identity;
    const { authAccounts: _privateAccounts, ...publicDb } = db;
    if (user.role === 'admin') return res.json({...publicDb, currentUserId: user.id, _contentRevision: contentRevision(db)});
    const filtered = {...publicDb, moduleRelations: (db.moduleRelations || []).filter((e: any) => e.approvalStatus === 'approved'), moduleGraphDocument: undefined, currentUserId: user.id,
      users: db.users.filter((u: any) => u.id === user.id),
      lessons: db.lessons.filter((l: any) => l.status === 'published'),
      exams: db.exams.filter((e: any) => e.status === 'published'),
      libraryFiles: [], auditLogs: [], notifications: [], promptSnapshots: [],
      assessmentRetakeGrants: (db.assessmentRetakeGrants || []).filter((g: any) => g.userId === user.id),
      lessonAttempts: db.lessonAttempts.filter((a: any) => a.userId === user.id),
      knowledgeGaps: db.knowledgeGaps.filter((g: any) => g.userId === user.id),
      homework: db.homework.filter((h: any) => h.userId === user.id),
      assessments: db.assessments.filter((a: any) => a.userId === user.id),
      messages: db.messages.filter((m: any) => m.senderId === user.id || m.recipientId === user.id),
    };
    res.json(filtered);
  });

  // Module-level relations are a separate, mentor-controlled layer.
  const graphRevision = (db: any) => crypto.createHash('sha256').update(JSON.stringify(db.moduleRelations || [])).digest('hex');
  app.get('/api/module-graph', (req, res) => {
    const db = readDatabase(); if (!db) return res.sendStatus(500);
    const admin = (req as any).identity.role === 'admin';
    res.json({edges: admin ? db.moduleRelations || [] : (db.moduleRelations || []).filter((e: any) => e.approvalStatus === 'approved'), revision: admin ? graphRevision(db) : undefined});
  });
  app.get('/api/module-graph/export', (req, res) => {
    const db = readDatabase(); if (!db) return res.sendStatus(500);
    if (!db.moduleGraphDocument) return res.status(404).json({error:'Граф ещё не импортирован.'});
    res.json({...db.moduleGraphDocument, edges: db.moduleRelations || []});
  });
  app.post('/api/module-graph/preview', (req, res) => {
    const db = readDatabase(); if (!db) return res.sendStatus(500);
    const errors = validateModuleGraph(req.body, db.modules.map((m: any) => m.id));
    if (errors.length) return res.status(400).json({errors});
    res.json({revision:graphRevision(db), changes:graphDiff(db.moduleRelations || [], req.body.edges)});
  });
  app.post('/api/module-graph/import', (req, res) => {
    const db = readDatabase(); if (!db) return res.sendStatus(500);
    const graph = req.body?.graph, errors = validateModuleGraph(graph, db.modules.map((m: any) => m.id));
    if (errors.length) return res.status(400).json({errors});
    if (req.body.revision !== graphRevision(db)) return res.status(409).json({error:'Граф изменился. Повторите предпросмотр.'});
    const changes = graphDiff(db.moduleRelations || [], graph.edges);
    const conflicts = changes.filter(c => c.action === 'conflict');
    const confirmed = Array.isArray(req.body.confirmedConflicts) ? req.body.confirmedConflicts : [];
    if (conflicts.some(c => !confirmed.includes(c.id))) return res.status(409).json({error:'Подтвердите замену всех конфликтующих решений.', conflicts});
    const existing = new Map((db.moduleRelations || []).map((e: any) => [e.id, e]));
    for (const edge of graph.edges) existing.set(edge.id, edge);
    db.moduleRelations = [...existing.values()];
    const {edges: _edges, ...document} = graph; db.moduleGraphDocument = document;
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({changes, count:db.moduleRelations.length, revision:graphRevision(db)});
  });
  app.post('/api/module-graph/update', (req, res) => {
    const db = readDatabase(); if (!db) return res.sendStatus(500);
    if (req.body?.revision !== graphRevision(db)) return res.status(409).json({error:'Граф изменился. Обновите страницу.'});
    const index = (db.moduleRelations || []).findIndex((e: any) => e.id === req.body?.edge?.id);
    if (index < 0) return res.sendStatus(404);
    const edge = req.body.edge;
    if (edge.id !== db.moduleRelations[index].id || edge.source !== db.moduleRelations[index].source || edge.target !== db.moduleRelations[index].target) return res.status(400).json({error:'ID и направления менять нельзя.'});
    const errors = validateModuleGraph({nodes: db.modules.map((m: any) => ({id:m.id})), edges:[edge]}, db.modules.map((m: any) => m.id));
    if (errors.length) return res.status(400).json({errors});
    db.moduleRelations[index] = edge;
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({edge, revision:graphRevision(db)});
  });

  app.post('/api/profile', (req, res) => {
    const db = readDatabase(), identity = (req as any).identity;
    const user = db?.users.find((u: any) => u.id === identity.id);
    if (!user) return res.sendStatus(404);
    const avatar = req.body?.avatar;
    if (avatar === null) delete user.avatarUrl;
    else {
      if (typeof avatar !== 'string' || avatar.length > 700000) return res.status(400).json({error: 'Фото должно быть PNG, JPEG или WebP размером до 512 КБ.'});
      const match = avatar.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) return res.status(400).json({error: 'Неподдерживаемый формат фотографии.'});
      const bytes = Buffer.from(match[2], 'base64');
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp = bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
      if (bytes.length > 512 * 1024 || !((match[1] === 'png' && png) || (match[1] === 'jpeg' && jpeg) || (match[1] === 'webp' && webp))) return res.status(400).json({error: 'Некорректный файл фотографии.'});
      user.avatarUrl = avatar;
    }
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({success: true});
  });

  app.get('/api/messages/inbox', (req, res) => {
    const db = readDatabase(), identity = (req as any).identity;
    if (!db) return res.sendStatus(500);
    res.json((db.messages || []).filter((m: any) => m.senderId === identity.id || m.recipientId === identity.id));
  });

  app.post('/api/messages', (req, res) => {
    const db = readDatabase(), identity = (req as any).identity;
    const sender = db?.users.find((u: any) => u.id === identity.id);
    const recipientId = identity.role === 'student' ? 'admin-mentor' : req.body?.recipientId;
    const recipient = db?.users.find((u: any) => u.id === recipientId);
    if (!sender || !recipient || (identity.role === 'admin' ? recipient.role !== 'student' : recipient.role !== 'admin') || typeof req.body?.content !== 'string' || !req.body.content.trim() || req.body.content.length > 4000) return res.status(400).json({error: 'Выберите получателя и введите сообщение длиной до 4000 символов.'});
    const message = {id: crypto.randomUUID(), senderId: sender.id, senderName: sender.displayName, senderRole: identity.role, recipientId, subject: identity.role === 'admin' ? 'Сообщение ментора' : 'Сообщение ученика', content: req.body.content.trim(), resolved: false, createdAt: new Date().toISOString()};
    db.messages ||= []; db.messages.unshift(message);
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.status(201).json({id: message.id});
  });

  app.post('/api/messages/read', (req, res) => {
    const db = readDatabase(), identity = (req as any).identity;
    const message = db?.messages.find((m: any) => m.id === req.body?.id && m.recipientId === identity.id);
    if (!message) return res.sendStatus(404);
    if (!message.readAt) message.readAt = new Date().toISOString();
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({success: true});
  });

  app.post('/api/snapshots', (req, res) => {
    const db = readDatabase(), user = (req as any).identity;
    const lesson = db?.lessons.find((l: any) => l.code === req.body.lessonId && l.status === 'published');
    if (!lesson || typeof req.body.prompt !== 'string' || req.body.prompt.length > 500000) return res.status(400).send('Урок недоступен или промпт некорректен.');
    if (user.role === 'student' && lesson.previousLessonId && !db.lessonAttempts.some((a: any) => a.userId === user.id && a.lessonId === lesson.previousLessonId && a.structuredReport?.lessonStatus === 'completed')) return res.status(403).send('Сначала завершите и отправьте отчёт предыдущего урока.');
    const previousCode = lesson.previousLessonId || (() => {
      const match = lesson.code.match(/^(.*-U)(\d+)$/);
      return match && Number(match[2]) > 1 ? `${match[1]}${String(Number(match[2]) - 1).padStart(match[2].length, '0')}` : null;
    })();
    const previousAttempt = db.lessonAttempts.find((a: any) => a.userId === user.id && a.lessonId === previousCode);
    const expected = assembleLessonPrompt({
      lesson, previousLessonId: previousCode,
      previousLessonReport: previousAttempt?.structuredReport || null,
      unresolvedGaps: db.knowledgeGaps.filter((g: any) => g.userId === user.id && g.status === 'needs-review'),
      pendingHomework: db.homework.filter((h: any) => h.userId === user.id && (h.lessonId === previousCode || ['assigned', 'submitted', 'needs_revision', 'not_submitted'].includes(h.status))),
      mentorSpecialNotes: previousAttempt?.mentorFeedback ? [previousAttempt.mentorFeedback] : [],
    });
    if (req.body.prompt !== expected.fullPromptText) return res.status(409).send('Материалы или результаты изменились. Обновите страницу перед копированием промпта.');
    const sourceHash = crypto.createHash('sha256').update(JSON.stringify({promptTemplate: lesson.promptTemplate, generalRules: lesson.generalRules || '', moduleInstructions: lesson.moduleInstructions || ''})).digest('hex');
    const snapshot = {id: crypto.randomUUID(), userId: user.id, lessonId: lesson.code, promptVersion: lesson.version, sourceHash, promptSnapshot: expected.fullPromptText, createdAt: new Date().toISOString()};
    db.promptSnapshots ||= []; db.promptSnapshots.unshift(snapshot);
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({id: snapshot.id});
  });

  // The demonstration is a separate localhost-only database; this route is never
  // registered for the ordinary database or a server listening on another host.
  const demoFile = path.resolve(__dirname, 'data', 'visible-demo', 'database.json');
  if (process.env.NEXUS_VISIBLE_DEMO === '1' && DATA_FILE === demoFile && (process.env.NEXUS_HOST || '127.0.0.1') === '127.0.0.1') {
    const demoUserId = 'local-visible-demo-student';
    const collections = ['lessonAttempts', 'knowledgeGaps', 'homework', 'promptSnapshots', 'assessments'];
    const localAdmin = (req: express.Request, res: express.Response) => {
      if (!['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.ip || '') || (req as any).identity?.role !== 'admin') { res.sendStatus(403); return false; }
      return true;
    };
    app.get('/api/demo/status', (req, res) => {
      if (!localAdmin(req, res)) return;
      const db = readDatabase();
      res.json({state: db.lessonAttempts.filter((a: any) => a.userId === demoUserId).length,
        available: [0,1,2,3].filter(n => fs.existsSync(path.join(path.dirname(demoFile), `state-${n}.json`)))});
    });
    app.get('/api/demo/next-prompt', (req, res) => {
      if (!localAdmin(req, res)) return;
      const db = readDatabase();
      const lesson = db?.lessons.find((l: any) => l.code === 'M01-T02-U02');
      const previous = db?.lessonAttempts.find((a: any) => a.userId === demoUserId && a.lessonId === 'M01-T02-U01');
      if (!lesson || !previous) return res.status(400).json({error:'Сначала выберите состояние после трёх уроков.'});
      const prompt = assembleLessonPrompt({lesson, previousLessonId:'M01-T02-U01', previousLessonReport:previous.structuredReport,
        unresolvedGaps:db.knowledgeGaps.filter((g: any) => g.userId === demoUserId && g.status === 'needs-review'),
        pendingHomework:db.homework.filter((h: any) => h.userId === demoUserId && (h.lessonId === 'M01-T02-U01' || ['assigned','submitted','needs_revision','not_submitted'].includes(h.status)))});
      res.json({lessonId:lesson.code, published:lesson.status === 'published', prompt:prompt.fullPromptText});
    });
    app.post('/api/demo/state', (req, res) => {
      if (!localAdmin(req, res)) return;
      const state = req.body?.state;
      if (!Number.isInteger(state) || state < 0 || state > 3) return res.sendStatus(400);
      const file = path.join(path.dirname(demoFile), `state-${state}.json`);
      if (!fs.existsSync(file)) return res.status(404).json({error: 'Демонстрационное состояние ещё не подготовлено.'});
      const db = readDatabase();
      let saved: any;
      try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return res.sendStatus(500); }
      if (!db?.visibleDemo || saved.userId !== demoUserId || saved.state !== state || collections.some(key => !Array.isArray(saved[key]) || saved[key].some((item: any) => item.userId !== demoUserId))) return res.sendStatus(400);
      for (const key of collections) db[key] = [...(db[key] || []).filter((item: any) => item.userId !== demoUserId), ...saved[key]];
      if (!writeDatabase(db)) return res.sendStatus(500);
      res.json({state});
    });
  }

  app.post('/api/homework', (req, res) => {
    const db = readDatabase(), user = (req as any).identity;
    const hw = db?.homework.find((h: any) => h.id === req.body.id && h.userId === user.id);
    if (!hw || typeof req.body.answer !== 'string' || !req.body.answer.trim() || req.body.answer.length > 20000) return res.sendStatus(400);
    hw.studentAnswer = req.body.answer; hw.status = 'submitted'; hw.submittedAt = new Date().toISOString();
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({success: true});
  });

  app.post('/api/reports', (req, res) => {
    const db = readDatabase(), user = (req as any).identity;
    const lesson = db?.lessons.find((l: any) => l.code === req.body.lessonId && l.status === 'published');
    const snapshot = db?.promptSnapshots?.find((s: any) => s.id === req.body.snapshotId && s.userId === user.id && s.lessonId === lesson?.code);
    if (!lesson || !snapshot || typeof req.body.rawText !== 'string') return res.status(400).json({error: 'Сначала скопируйте промпт доступного урока.'});
    const result = validateStructuredReport(req.body.rawText, lesson.code);
    if (result.valid === false) return res.status(400).json({error: result.errors.join(' ')});
    const report = result.report;
    if (report.lessonStatus !== 'completed') return res.status(400).json({error: 'Для завершения занятия требуется фактически завершённый отчёт.'});
    if (/симуляц|демонстрацион|simulation/i.test(report.studentNotes || '')) return res.status(400).json({error: 'Демонстрационный отчёт нельзя записать как фактическое прохождение.'});
    if (lesson.code === 'M01-T01-U01') {
      const required = [1, 2, 3, 4].map(n => `M01-T01-U01-HW0${n}`);
      if (report.homework.length !== 4 || required.some(id => !report.homework.some(h => h.id === id))) return res.status(400).json({error: 'Отчёт U01 должен содержать все четыре официальных задания с их ID.'});
    }
    if (lesson.code === 'M01-T01-U02') {
      const required = [1, 2, 3].map(n => `M01-T01-U02-HW0${n}`);
      if (report.homework.length !== 3 || required.some(id => !report.homework.some(h => h.id === id))) return res.status(400).json({error: 'Отчёт U02 должен содержать три официальных задания с их ID.'});
    }
    const reportHash = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
    const existing = db.lessonAttempts.find((a: any) => a.userId === user.id && a.lessonId === lesson.code && a.reportHash === reportHash);
    if (existing) return res.json({id: existing.id, duplicate: true});
    if (report.entryControl) {
      const previous = lesson.previousLessonId || lesson.code.replace(/-U(\d+)$/, (_: string, n: string) => `-U${String(Number(n)-1).padStart(n.length, '0')}`);
      if (report.entryControl.previousLessonId !== previous) return res.status(400).json({error: 'Неверный предыдущий урок.'});
      for (const h of report.entryControl.homeworkResults) if (!db.homework.some((x: any) => x.userId === user.id && x.id === h.homeworkId && (x.lessonId === previous || (['assigned', 'submitted', 'needs_revision', 'not_submitted'].includes(x.status) && snapshot.promptSnapshot.includes(x.id))))) return res.status(400).json({error: `Неизвестное ДЗ ${h.homeworkId}`});
      const previousReport = db.lessonAttempts.find((a: any) => a.userId === user.id && a.lessonId === previous)?.structuredReport;
      if (!previousReport) return res.status(400).json({error: 'Предыдущий отчёт не найден.'});
      for (const q of report.entryControl.recheckResults) {
        if (q.sourceGapId) {
          const gap = db.knowledgeGaps.find((g: any) => g.id === q.sourceGapId && g.userId === user.id && (!q.sourceLessonId || g.sourceLessonId === q.sourceLessonId));
          if (!gap) return res.status(400).json({error: `Нет указанного пробела ${q.sourceGapId}.`});
          if (q.sourceQuestionId && gap.sourceQuestionId && q.sourceQuestionId !== gap.sourceQuestionId) return res.status(400).json({error: 'Вопрос не соответствует пробелу.'});
        } else {
          const sourceLessonId = q.sourceLessonId || previous;
          const source = db.lessonAttempts.find((a: any) => a.userId === user.id && a.lessonId === sourceLessonId)?.structuredReport;
          if (!source?.assessment?.questions?.some((item: any) => item.questionId === q.sourceQuestionId && (item.result !== 'correct' || item.needsRecheck))) return res.status(400).json({error: `Нет исходной ошибки ${q.sourceQuestionId}.`});
        }
      }
      for (const h of report.entryControl.homeworkResults) {
        const hw = db.homework.find((x: any) => x.userId === user.id && x.id === h.homeworkId);
        hw.reviewHistory ||= [];
        hw.reviewHistory.push({sourceLessonId: hw.lessonId, checkedLessonId: lesson.code, status: h.status, feedback: h.feedback, evidence: h.evidence || '', errors: h.errors || [], skillIds: h.skillIds || [], needsRevision: h.needsRevision ?? (h.status === 'needs_revision'), source: 'student_self_report', recordedAt: new Date().toISOString()});
        if (hw.status !== 'verified') hw.status = h.status;
        hw.aiFeedback = h.feedback; hw.checkedBySelfReport = true; hw.checkedLessonId = lesson.code;
      }
      for (const q of report.entryControl.recheckResults) {
        const sourceLessonId = q.sourceLessonId || previous;
        for (const gap of db.knowledgeGaps.filter((g: any) => g.userId === user.id && (q.sourceGapId ? g.id === q.sourceGapId : g.sourceLessonId === sourceLessonId && (g.sourceQuestionId === q.sourceQuestionId || (!g.sourceQuestionId && g.description.match(/\bQ\d{2}\b/)?.[0] === q.sourceQuestionId))))) {
          gap.status = q.status === 'persists' ? 'needs-review' : 'resolved';
          gap.recheckHistory ||= [];
          gap.recheckHistory.push({checkedLessonId: lesson.code, status: q.status, evidence: q.evidence, source: 'student_self_report', recordedAt: new Date().toISOString()});
          gap.recheckEvidence = q.evidence;
          gap.resolutionSource = 'student_self_report';
        }
      }
    }
    const now = new Date().toISOString();
    const attempt = {id: crypto.randomUUID(), userId: user.id, lessonId: lesson.code, promptVersion: snapshot.promptVersion, promptSnapshot: snapshot.promptSnapshot, status: 'submitted', rawReport: req.body.rawText, structuredReport: report, reportHash, score: report.assessment.earnedScore, maxScore: report.assessment.maxScore, mentorConfirmed: false, startedAt: snapshot.createdAt, submittedAt: now};
    db.lessonAttempts.unshift(attempt);
    for (const gap of report.knowledgeGaps.filter((g: any) => g.status === 'needs-review')) {
      const qualified = gap.description.match(/(M\d{2}-T\d{2}-U\d{2}):(Q\d{2})\b/);
      const sourceQuestionId = qualified?.[2] || gap.description.match(/\bQ\d{2}\b/)?.[0];
      // Older gaps are already represented by their original record. Rechecks above
      // update that record; treating a mention as a new current-lesson gap duplicates it.
      if (qualified && qualified[1] !== lesson.code) continue;
      if (sourceQuestionId && db.knowledgeGaps.some((g: any) => g.userId === user.id && g.sourceLessonId === lesson.code && g.sourceQuestionId === sourceQuestionId && g.skillId === gap.skillId && g.status === 'needs-review')) continue;
      db.knowledgeGaps.unshift({id: crypto.randomUUID(), userId: user.id, skillId: gap.skillId, description: gap.description, sourceLessonId: lesson.code, ...(sourceQuestionId ? {sourceQuestionId} : {}), status: 'needs-review', mandatoryNextCheck: true, createdAt: now});
    }
    // A report cannot make an incorrect answer disappear by omitting knowledgeGaps.
    for (const question of report.assessment.questions.filter((q: any) => q.result !== 'correct' || q.needsRecheck)) {
      for (const skillId of question.skillIds.length ? question.skillIds : ['general']) {
        if (!db.knowledgeGaps.some((g: any) => g.userId === user.id && g.sourceLessonId === lesson.code && g.skillId === skillId && g.sourceQuestionId === question.questionId && g.status === 'needs-review')) {
          db.knowledgeGaps.unshift({id: crypto.randomUUID(), userId: user.id, skillId, sourceQuestionId: question.questionId, description: `${question.questionId}: ${question.feedback}`, sourceLessonId: lesson.code, status: 'needs-review', mandatoryNextCheck: true, createdAt: now});
        }
      }
    }
    for (const h of report.homework) if (!db.homework.some((x: any) => x.userId === user.id && x.lessonId === lesson.code && x.id === h.id)) db.homework.unshift({...h, lessonId: lesson.code, userId: user.id, status: 'assigned', assignedAt: now});
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({id: attempt.id});
  });

  app.get('/api/mentor/users', (req, res) => {
    const db = readDatabase();
    if (!db) return res.sendStatus(500);
    res.json((db.authAccounts || []).filter((a: any) => a.role === 'student' && !a.archivedAt).map((a: any) => ({username: a.username, userId: a.userId, role: a.role, active: a.active, displayName: db.users.find((u: any) => u.id === a.userId)?.displayName || a.userId})));
  });

  app.post('/api/mentor/users', (req, res) => {
    const db = readDatabase();
    if (!db) return res.sendStatus(500);
    const {username, displayName, password} = req.body;
    if (typeof username !== 'string' || !/^[a-z][a-z0-9_-]{2,31}$/.test(username) || ['mentor', 'student'].includes(username) || typeof displayName !== 'string' || !displayName.trim() || displayName.length > 100 || typeof password !== 'string' || password.length < 16 || password.length > 256) return res.status(400).json({error: 'Логин: 3–32 латинских символа, цифры, _ или -; пароль — от 16 символов.'});
    db.authAccounts ||= [];
    if (db.authAccounts.some((a: any) => a.username === username)) return res.status(409).json({error: 'Такой логин уже существует.'});
    const salt = crypto.randomBytes(32);
    const userId = crypto.randomUUID(), now = new Date().toISOString();
    db.authAccounts.push({username, userId, role: 'student', active: true, salt: salt.toString('hex'), passwordHash: crypto.scryptSync(password, salt, 64).toString('hex')});
    db.users.push({id: userId, email: '', displayName: displayName.trim(), role: 'student', createdAt: now, lastSeenAt: now});
    db.auditLogs.unshift({id: crypto.randomUUID(), actorId: (req as any).identity.id, actorName: 'Главный ментор', action: 'CREATE_USER', targetType: 'USER', targetId: userId, reason: `Создана учётная запись ${username}`, timestamp: now});
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.status(201).json({userId, username});
  });

  app.post('/api/mentor/users/update', (req, res) => {
    const db = readDatabase();
    const {userId, active, password} = req.body;
    const account = db?.authAccounts?.find((a: any) => a.userId === userId);
    if (!account || (active !== undefined && typeof active !== 'boolean') || (password !== undefined && (typeof password !== 'string' || password.length < 16 || password.length > 256)) || (active === undefined && password === undefined)) return res.status(400).json({error: 'Укажите корректное изменение учётной записи.'});
    for (const [token, session] of sessions) if (session.id === userId) sessions.delete(token);
    if (active !== undefined) account.active = active;
    if (password !== undefined) { const salt = crypto.randomBytes(32); account.salt = salt.toString('hex'); account.passwordHash = crypto.scryptSync(password, salt, 64).toString('hex'); }
    db.auditLogs.unshift({id: crypto.randomUUID(), actorId: (req as any).identity.id, actorName: 'Главный ментор', action: 'UPDATE_USER', targetType: 'USER', targetId: userId, reason: active === undefined ? 'Пароль изменён' : active ? 'Доступ включён' : 'Доступ отключён', timestamp: new Date().toISOString()});
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({success: true});
  });

  app.post('/api/mentor/users/archive', (req, res) => {
    const db=readDatabase(), account=db?.authAccounts?.find((a:any)=>a.userId===req.body?.userId && a.role==='student' && !a.archivedAt);
    if (!account) return res.sendStatus(404);
    account.active=false; account.archivedAt=new Date().toISOString();
    for (const [token, session] of sessions) if (session.id===account.userId) sessions.delete(token);
    db.auditLogs.unshift({id:crypto.randomUUID(),actorId:(req as any).identity.id,actorName:'Ментор',action:'ARCHIVE_USER',targetType:'USER',targetId:account.userId,reason:'Учётная запись удалена из списка; история сохранена',timestamp:account.archivedAt});
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({success:true});
  });

  // A submitted assessment is a self-report. The server controls attempts and grades.
  app.post('/api/assessments', (req, res) => {
    const db = readDatabase(), user = (req as any).identity;
    const exam = db?.exams.find((e: any) => e.id === req.body.targetId && e.status === 'published');
    const {theory1Score, theory2Score, practicalScore, answersNotes} = req.body;
    if (!exam || user.role !== 'student' || ![theory1Score, theory2Score, practicalScore].every((n: any) => typeof n === 'number' && Number.isFinite(n)) || theory1Score < 0 || theory1Score > 30 || theory2Score < 0 || theory2Score > 30 || practicalScore < 0 || practicalScore > 40 || typeof answersNotes !== 'string' || !answersNotes.trim() || answersNotes.length > 20000) return res.status(400).json({error: 'Выберите опубликованную аттестацию, укажите баллы и описание фактического отчёта.'});
    const previous = db.assessments.filter((a: any) => a.userId === user.id && a.targetId === exam.id);
    const grants = (db.assessmentRetakeGrants || []).filter((g: any) => g.userId === user.id && g.targetId === exam.id).length;
    if (previous.length >= 4 + grants || previous.some((a: any) => a.score / a.maxScore >= 0.5)) return res.status(403).json({error: 'Новая попытка недоступна. Обратитесь к ментору.'});
    const now = new Date().toISOString(), number = previous.length + 1;
    const grade = classifyScore(theory1Score + theory2Score + practicalScore, 100, number);
    const record = {id: crypto.randomUUID(), userId: user.id, targetId: exam.id, targetTitle: exam.title, type: exam.type === 'exam' ? 'exam' : 'control_work', attemptNumber: number, score: grade.score, maxScore: 100, percentage: grade.percentage, grade: grade.grade, verificationStatus: 'self_reported', requiresIntervention: grade.requiresIntervention, timestamp: now, details: {theory1Score, theory2Score, practicalScore, answersNotes}};
    db.assessments.unshift(record);
    db.notifications.unshift({id: crypto.randomUUID(), eventType: number > 1 ? 'retake_alert' : exam.type === 'exam' ? 'exam' : 'control_work', title: number === 4 ? 'Третья пересдача: получен отчёт' : `Отчёт: ${exam.title}`, description: `Попытка ${number}, результат ${grade.score}/100; самоотчёт ученика.`, studentId: user.id, studentName: db.users.find((u: any) => u.id === user.id)?.displayName || user.id, relatedEntityId: record.id, status: 'unread', score: grade.score, maxScore: 100, createdAt: now});
    if (number === 3 && !grade.isPassing) db.notifications.unshift({id: crypto.randomUUID(), eventType: 'retake_alert', title: `Требуется третья пересдача: ${exam.title}`, description: 'После двух неудачных пересдач доступна последняя штатная пересдача; требуется внимание ментора.', studentId: user.id, studentName: db.users.find((u: any) => u.id === user.id)?.displayName || user.id, relatedEntityId: record.id, status: 'unread', createdAt: now});
    if (!writeDatabase(db)) return res.sendStatus(500);
    return res.json(record);
  });

  app.post('/api/mentor/review', (req, res) => {
    const db = readDatabase(), user = (req as any).identity;
    if (user.role !== 'admin') return res.sendStatus(403);
    const attempt = db?.lessonAttempts.find((a: any) => a.id === req.body.attemptId);
    const {score, feedback, reason} = req.body;
    if (!attempt || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > attempt.maxScore || typeof reason !== 'string' || !reason.trim() || typeof feedback !== 'string') return res.status(400).json({error: 'Укажите корректный балл и причину решения.'});
    const oldScore = attempt.score, now = new Date().toISOString();
    Object.assign(attempt, {score, mentorFeedback: feedback, mentorConfirmed: true, status: 'mentor_confirmed', confirmedAt: now});
    addMentorMessage(db, attempt.userId, `Отчёт ${attempt.lessonId}`, feedback || 'Ментор подтвердил отчёт.');
    db.auditLogs.unshift({id: crypto.randomUUID(), actorId: user.id, actorName: db.users.find((u: any) => u.id === user.id)?.displayName || user.id, action: 'MENTOR_CONFIRM_ATTEMPT', targetType: 'LESSON_ATTEMPT', targetId: attempt.id, reason, previousValue: String(oldScore), newValue: String(score), timestamp: now});
    if (!writeDatabase(db)) return res.sendStatus(500);
    return res.json({success: true});
  });

  app.post('/api/mentor/homework', (req, res) => {
    const db = readDatabase(), mentor = (req as any).identity;
    const {homeworkId, userId, status, feedback} = req.body;
    const hw = db?.homework.find((h: any) => h.id === homeworkId && h.userId === userId);
    if (!hw || !userId || !['verified', 'needs_revision'].includes(status) || typeof feedback !== 'string' || !feedback.trim()) return res.status(400).json({error: 'Выберите работу ученика и укажите комментарий.'});
    const now = new Date().toISOString();
    hw.status = status; hw.mentorFeedback = feedback; hw.verifiedAt = now;
    addMentorMessage(db, userId, `Домашнее задание ${homeworkId}`, feedback);
    db.auditLogs.unshift({id: crypto.randomUUID(), actorId: mentor.id, actorName: 'Главный ментор', action: 'MENTOR_REVIEW_HOMEWORK', targetType: 'HOMEWORK', targetId: homeworkId, reason: feedback, timestamp: now});
    if (!writeDatabase(db)) return res.sendStatus(500);
    return res.json({success: true});
  });

  app.post('/api/mentor/retake', (req, res) => {
    const db = readDatabase(), mentor = (req as any).identity;
    if (!db) return res.sendStatus(500);
    const {userId, targetId, reason} = req.body;
    const attempts = db?.assessments.filter((a: any) => a.userId === userId && a.targetId === targetId) || [];
    db.assessmentRetakeGrants ||= [];
    const grants = db.assessmentRetakeGrants.filter((g: any) => g.userId === userId && g.targetId === targetId).length;
    if (mentor.role !== 'admin' || typeof reason !== 'string' || !reason.trim() || attempts.length < 4 + grants || attempts.some((a: any) => a.score / a.maxScore >= 0.5)) return res.status(400).json({error: 'Дополнительная попытка не может быть назначена.'});
    const now = new Date().toISOString();
    db.assessmentRetakeGrants.push({id: crypto.randomUUID(), userId, targetId, reason, createdAt: now});
    db.auditLogs.unshift({id: crypto.randomUUID(), actorId: mentor.id, actorName: 'Главный ментор', action: 'GRANT_EXTRA_RETAKE', targetType: 'ASSESSMENT', targetId, reason, timestamp: now});
    if (!writeDatabase(db)) return res.sendStatus(500);
    return res.json({success: true});
  });

  app.post('/api/mentor/assessment', (req, res) => {
    const db = readDatabase(), user = (req as any).identity;
    if (user.role !== 'admin') return res.sendStatus(403);
    const record = db?.assessments.find((a: any) => a.id === req.body.assessmentId);
    if (!record || !['mentor_confirmed', 'needs_correction'].includes(req.body.status) || typeof req.body.feedback !== 'string' || !req.body.feedback.trim()) return res.status(400).json({error: 'Укажите решение и комментарий.'});
    record.verificationStatus = req.body.status; record.feedback = req.body.feedback;
    addMentorMessage(db, record.userId, `Аттестация ${record.targetId}`, req.body.feedback);
    db.auditLogs.unshift({id: crypto.randomUUID(), actorId: user.id, actorName: db.users.find((u: any) => u.id === user.id)?.displayName || user.id, action: 'MENTOR_CONFIRM_ASSESSMENT', targetType: 'ASSESSMENT', targetId: record.id, reason: req.body.feedback, timestamp: new Date().toISOString()});
    if (!writeDatabase(db)) return res.sendStatus(500);
    return res.json({success: true});
  });

  // 3. Full DB Save
  app.post('/api/db', (req, res) => {
    const newDb = req.body;
    if (!newDb || !Array.isArray(newDb.modules) || !Array.isArray(newDb.lessons)) {
      return res.status(400).json({ error: 'Invalid database structure' });
    }
    const current = readDatabase();
    if (!current) return res.sendStatus(500);
    if (typeof newDb._contentRevision !== 'string' || newDb._contentRevision !== contentRevision(current)) return res.status(409).json({error: 'Учебные материалы изменились. Обновите страницу и повторите редактирование.'});
    const existingAudit = current.auditLogs || [];
    const knownAuditIds = new Set(existingAudit.map((entry: any) => entry.id));
    newDb.auditLogs = [...(newDb.auditLogs || []).filter((entry: any) => entry?.id && !knownAuditIds.has(entry.id)), ...existingAudit];
    delete newDb._contentRevision;
    // Bulk CMS saves must not overwrite independently submitted student records.
    for (const key of ['users', 'lessonAttempts', 'knowledgeGaps', 'homework', 'assessments', 'messages', 'notifications', 'promptSnapshots', 'assessmentRetakeGrants', 'authAccounts', 'moduleRelations', 'moduleGraphDocument']) newDb[key] = current[key] || [];
    delete newDb.currentUserId;
    const success = writeDatabase(newDb);
    if (!success) {
      return res.status(500).json({ error: 'Failed to write database to disk' });
    }
    res.json({ success: true, revision: contentRevision(newDb) });
  });

  // 4. Update or Create Lesson with Version History
  app.post('/api/content/lesson', (req, res) => {
    const db = readDatabase();
    if (!db) return res.status(500).json({ error: 'Database unavailable' });

    const { lesson, changelog, authorName, authorId, bumpMinorVersion, bumpMajorVersion } = req.body;
    if (!lesson || !lesson.id || !lesson.code) {
      return res.status(400).json({ error: 'Missing required lesson data' });
    }

    const idx = db.lessons.findIndex((l: any) => l.id === lesson.id || l.code === lesson.code);
    const now = new Date().toISOString();
    const promptText = lesson.promptTemplate || '';
    const newHash = crypto.createHash('sha256').update(promptText).digest('hex');

    if (idx >= 0) {
      const existing = db.lessons[idx];
      const oldHash = existing.contentHash || crypto.createHash('sha256').update(existing.promptTemplate || '').digest('hex');
      let newVersion = existing.version || '1.0';

      if (bumpMajorVersion) {
        const major = parseInt(newVersion.split('.')[0] || '1', 10);
        newVersion = `${major + 1}.0`;
      } else if (bumpMinorVersion || (oldHash !== newHash && changelog)) {
        const parts = newVersion.split('.');
        const major = parseInt(parts[0] || '1', 10);
        const minor = parseInt(parts[1] || '0', 10);
        newVersion = `${major}.${minor + 1}`;
      }

      const versionHistory = Array.isArray(existing.versionHistory) ? [...existing.versionHistory] : [];
      if (oldHash !== newHash || changelog) {
        versionHistory.unshift({
          version: existing.version || '1.0',
          promptText: existing.promptTemplate,
          authorId: authorId || 'admin-mentor',
          authorName: authorName || 'Главный ментор Дмитрий Волков',
          changelog: changelog || 'Редактирование текста промпта',
          createdAt: now,
          status: existing.status,
        });
      }

      db.lessons[idx] = {
        ...existing,
        ...lesson,
        version: newVersion,
        contentHash: newHash,
        versionHistory,
        updatedAt: now,
      };

      db.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        actorId: authorId || 'admin-mentor',
        actorName: authorName || 'Дмитрий Волков',
        action: 'UPDATE_LESSON',
        targetType: 'LESSON',
        targetId: lesson.code,
        reason: changelog || `Обновление урока ${lesson.code} до версии ${newVersion}`,
        timestamp: now,
      });

      writeDatabase(db);
      return res.json({ success: true, lesson: db.lessons[idx] });
    } else {
      const newLesson = {
        ...lesson,
        status: lesson.status || 'draft',
        version: lesson.version || '1.0',
        contentHash: newHash,
        versionHistory: [
          {
            version: '1.0',
            promptText: promptText,
            authorId: authorId || 'admin-mentor',
            authorName: authorName || 'Главный ментор Дмитрий Волков',
            changelog: changelog || 'Создание нового урока',
            createdAt: now,
            status: lesson.status || 'draft',
          },
        ],
        updatedAt: now,
      };
      db.lessons.push(newLesson);

      db.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        actorId: authorId || 'admin-mentor',
        actorName: authorName || 'Дмитрий Волков',
        action: 'CREATE_LESSON',
        targetType: 'LESSON',
        targetId: lesson.code,
        reason: changelog || `Создание урока ${lesson.code}`,
        timestamp: now,
      });

      writeDatabase(db);
      return res.json({ success: true, lesson: newLesson });
    }
  });

  // 5. Batch status update
  app.post('/api/content/batch', (req, res) => {
    const db = readDatabase();
    if (!db) return res.status(500).json({ error: 'Database unavailable' });

    const { action, lessonIds, actorId, actorName } = req.body;
    if (!action || !Array.isArray(lessonIds) || lessonIds.length === 0) {
      return res.status(400).json({ error: 'Missing action or lessonIds' });
    }

    const now = new Date().toISOString();
    let updatedCount = 0;

    db.lessons = db.lessons.map((l: any) => {
      if (lessonIds.includes(l.id) || lessonIds.includes(l.code)) {
        updatedCount++;
        let newStatus = l.status;
        if (action === 'publish') newStatus = 'published';
        else if (action === 'archive') newStatus = 'archived';
        else if (action === 'draft') newStatus = 'draft';
        return { ...l, status: newStatus, updatedAt: now };
      }
      return l;
    });

    db.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      actorId: actorId || 'admin-mentor',
      actorName: actorName || 'Дмитрий Волков',
      action: `BATCH_${action.toUpperCase()}`,
      targetType: 'LESSON_BATCH',
      targetId: `${lessonIds.length} lessons`,
      reason: `Массовое изменение статуса на ${action} для ${lessonIds.length} уроков`,
      timestamp: now,
    });

    writeDatabase(db);
    res.json({ success: true, updatedCount, lessons: db.lessons });
  });

  // 6. File Library Download
  // Library edits are separate from the course content write so they cannot erase
  // student results. Archived records keep an audit trail and original assets intact.
  app.post('/api/library/save', (req, res) => {
    const db = readDatabase(), {id, name, linkedEntity, contentBase64} = req.body || {};
    if (!db || typeof name !== 'string' || !name.trim() || name.length > 180 || /[\\/\x00-\x1f]/.test(name) || typeof linkedEntity !== 'string' || !/^(GLOBAL|M\d{2}(?:-T\d{2}(?:-U\d{2})?|-EX\d{2})?)$/.test(linkedEntity)) return res.status(400).json({error:'Укажите имя файла и корректную привязку к модулю, теме, уроку или билетам.'});
    const file = id ? db.libraryFiles.find((f: any) => f.id === id && f.status !== 'archived') : undefined;
    if (id && !file) return res.sendStatus(404);
    if (!id && typeof contentBase64 !== 'string') return res.status(400).json({error:'Выберите файл.'});
    let bytes: Buffer | undefined;
    if (contentBase64 !== undefined) {
      if (typeof contentBase64 !== 'string' || contentBase64.length > 11184812 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)) return res.status(400).json({error:'Некорректный файл или размер больше 8 МБ.'});
      bytes = Buffer.from(contentBase64, 'base64');
      if (!bytes.length || bytes.length > 8388608) return res.status(400).json({error:'Размер файла должен быть от 1 байта до 8 МБ.'});
    }
    const extension = name.toLowerCase().split('.').pop();
    if (!['json','md','txt','pdf','zip'].includes(extension || '')) return res.status(400).json({error:'Разрешены JSON, MD, TXT, PDF и ZIP.'});
    const now = new Date().toISOString();
    const item = file || {id:crypto.randomUUID(), uploadedAt:now, uploadedBy:(req as any).identity.id, version:'1', status:'active'};
    Object.assign(item, {name:name.trim(), linkedEntity, type:extension === 'md' || extension === 'txt' ? 'markdown' : extension});
    if (bytes) Object.assign(item, {contentBase64:bytes.toString('base64'), sizeBytes:bytes.length, checksumSha256:crypto.createHash('sha256').update(bytes).digest('hex'), contentPath:undefined, updatedAt:now});
    if (!file) db.libraryFiles.unshift(item);
    db.auditLogs.unshift({id:crypto.randomUUID(),actorId:(req as any).identity.id,actorName:'Ментор',action:file?'LIBRARY_UPDATE':'LIBRARY_ADD',targetType:'LIBRARY_FILE',targetId:item.id,reason:item.name,timestamp:now});
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({id:item.id});
  });
  app.post('/api/library/archive', (req, res) => {
    const db=readDatabase(), item=db?.libraryFiles.find((f:any)=>f.id===req.body?.id && f.status !== 'archived');
    if (!item) return res.sendStatus(404);
    item.status='archived'; item.archivedAt=new Date().toISOString();
    db.auditLogs.unshift({id:crypto.randomUUID(),actorId:(req as any).identity.id,actorName:'Ментор',action:'LIBRARY_ARCHIVE',targetType:'LIBRARY_FILE',targetId:item.id,reason:item.name,timestamp:item.archivedAt});
    if (!writeDatabase(db)) return res.sendStatus(500);
    res.json({success:true});
  });

  app.get('/api/library/download/:id', (req, res) => {
    const db = readDatabase();
    if (!db) return res.status(500).json({ error: 'Database unavailable' });

    const file = db.libraryFiles.find((f: any) => f.id === req.params.id);
    if (!file || file.status === 'archived') return res.status(404).json({ error: 'File not found' });
    if (typeof file.contentBase64 === 'string') {
      const content = Buffer.from(file.contentBase64, 'base64');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
      return res.send(content);
    }

    // Only files inside the approved asset directory may be served.
    const resolvedPath = file.contentPath ? path.resolve(__dirname, file.contentPath.replace(/^\//, '')) : '';
    if (resolvedPath.startsWith(ASSETS_DIR + path.sep) && fs.existsSync(resolvedPath)) return res.download(resolvedPath, path.basename(file.name));

    const altPath = path.resolve(__dirname, file.contentPath?.replace(/^\//, '') || '');
    if (altPath.startsWith(ASSETS_DIR + path.sep) && fs.existsSync(altPath)) {
      return res.download(altPath, file.name);
    }

    const fallbackPath = path.join(ASSETS_DIR, path.basename(file.name));
    if (fs.existsSync(fallbackPath)) {
      return res.download(fallbackPath, file.name);
    }

    res.status(404).json({ error: 'Physical file not found on server' });
  });

  // 7. Export endpoints
  app.get('/api/export/lesson/:code', (req, res) => {
    const db = readDatabase();
    if (!db) return res.status(500).json({ error: 'Database unavailable' });

    const lesson = db.lessons.find((l: any) => l.code === req.params.code || l.id === req.params.code);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${lesson.code}.md"`);
    res.send(lesson.promptTemplate || '');
  });

  app.get('/api/export/curriculum/json', (req, res) => {
    const db = readDatabase();
    if (!db) return res.status(500).json({ error: 'Database unavailable' });

    const exportData = {
      format: 'NEXUS-Academy-Curriculum-Export',
      exportDate: new Date().toISOString(),
      modules: db.modules,
      topics: db.topics,
      lessons: db.lessons,
      skills: db.skills,
      relations: db.relations,
      exams: db.exams,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nexus_curriculum_export.json"');
    res.send(JSON.stringify(exportData, null, 2));
  });

  app.get('/api/export/curriculum/zip', async (req, res) => {
    try {
      const db = readDatabase();
      if (!db) return res.status(500).json({ error: 'Database unavailable' });

      const zip = new JSZip();
      zip.file('curriculum.json', JSON.stringify({
        modules: db.modules,
        topics: db.topics,
        skills: db.skills,
        relations: db.relations,
        exams: db.exams,
      }, null, 2));

      const lessonsFolder = zip.folder('lessons');
      if (lessonsFolder) {
        db.lessons.forEach((l: any) => {
          lessonsFolder.file(`${l.code}.md`, l.promptTemplate || '');
        });
      }

      const content = await zip.generateAsync({ type: 'nodebuffer' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="nexus_curriculum_full.zip"');
      res.send(content);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mount Vite middlewares in development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, process.env.NEXUS_HOST || '127.0.0.1', () => {
    console.log(`[NEXUS Server] Full-Stack server running on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('[NEXUS Server] Failed to start:', err);
  void postgresStore?.close();
  process.exitCode = 1;
});

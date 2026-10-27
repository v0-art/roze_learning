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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.resolve(__dirname, 'data', 'nexus_academy.json');
const ASSETS_DIR = path.resolve(__dirname, 'public', 'assets', 'aistudio');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Helpers for reading/writing DB
function readDatabase(): any {
  try {
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
    const tmpFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Error writing database file:', err);
    return false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    res.json(db);
  });

  // 3. Full DB Save
  app.post('/api/db', (req, res) => {
    const newDb = req.body;
    if (!newDb || !Array.isArray(newDb.modules) || !Array.isArray(newDb.lessons)) {
      return res.status(400).json({ error: 'Invalid database structure' });
    }
    const success = writeDatabase(newDb);
    if (!success) {
      return res.status(500).json({ error: 'Failed to write database to disk' });
    }
    res.json({ success: true, message: 'Database saved to disk successfully' });
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
  app.get('/api/library/download/:id', (req, res) => {
    const db = readDatabase();
    if (!db) return res.status(500).json({ error: 'Database unavailable' });

    const file = db.libraryFiles.find((f: any) => f.id === req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    if (file.contentPath && fs.existsSync(file.contentPath)) {
      return res.download(file.contentPath, file.name);
    }

    const altPath = path.resolve(__dirname, file.contentPath?.replace(/^\//, '') || '');
    if (fs.existsSync(altPath)) {
      return res.download(altPath, file.name);
    }

    const fallbackPath = path.join(ASSETS_DIR, file.name);
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

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[NEXUS Server] Full-Stack server running on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('[NEXUS Server] Failed to start:', err);
});

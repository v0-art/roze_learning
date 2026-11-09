import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const requiredArrays = ['users', 'modules', 'topics', 'lessons', 'skills', 'relations', 'exams', 'lessonAttempts', 'knowledgeGaps', 'homework', 'assessments', 'notifications', 'auditLogs', 'messages'];

export function validateDatabase(data: unknown): asserts data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Некорректная база: ожидался объект.');
  for (const key of requiredArrays) if (!Array.isArray((data as Record<string, unknown>)[key])) throw new Error(`Некорректная база: отсутствует массив ${key}.`);
}

export function createBackup(databasePath: string, backupDirectory: string): string {
  const bytes = fs.readFileSync(databasePath);
  validateDatabase(JSON.parse(bytes.toString('utf8')));
  fs.mkdirSync(backupDirectory, {recursive: true, mode: 0o700});
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(6).toString('hex')}`;
  const target = path.join(backupDirectory, `nexus-${id}.json`);
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(target, bytes, {flag:'wx', mode:0o600});
  fs.writeFileSync(`${target}.sha256`, `${checksum}\n`, {flag:'wx', mode:0o600});
  return target;
}

export function restoreBackup(databasePath: string, backupFile: string, backupDirectory: string): string {
  const bytes = fs.readFileSync(backupFile);
  const expected = fs.readFileSync(`${backupFile}.sha256`, 'utf8').trim();
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expected) || expected !== actual) throw new Error('Контрольная сумма резервной копии не совпадает.');
  validateDatabase(JSON.parse(bytes.toString('utf8')));
  const previous = createBackup(databasePath, backupDirectory);
  const temp = `${databasePath}.restore-${crypto.randomBytes(6).toString('hex')}`;
  try { fs.writeFileSync(temp, bytes, {flag:'wx', mode:0o600}); fs.renameSync(temp, databasePath); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return previous;
}

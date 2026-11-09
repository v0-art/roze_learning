import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackup, restoreBackup } from './backup';

test('backup and restore preserve old state and reject corrupted copies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-backup-'));
  try {
    const db = path.join(dir, 'db.json'), backups = path.join(dir, 'backups');
    fs.copyFileSync('data/nexus_academy.json', db);
    const original = fs.readFileSync(db, 'utf8');
    const backup = createBackup(db, backups);
    const changed = JSON.parse(original); changed.modules[0].title = 'test change';
    fs.writeFileSync(db, JSON.stringify(changed));
    const previous = restoreBackup(db, backup, backups);
    assert.equal(fs.readFileSync(db, 'utf8'), original);
    assert.equal(JSON.parse(fs.readFileSync(previous, 'utf8')).modules[0].title, 'test change');
    fs.appendFileSync(backup, 'corruption');
    assert.throws(() => restoreBackup(db, backup, backups), /Контрольная сумма/);
    assert.equal(fs.readFileSync(db, 'utf8'), original);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

import path from 'node:path';
import { createBackup, restoreBackup } from '../src/core/backup';

const [action, backupFile, confirmation] = process.argv.slice(2);
const databasePath = process.env.NEXUS_DATA_FILE || path.resolve('data/nexus_academy.json');
const backupDirectory = process.env.NEXUS_BACKUP_DIR || path.resolve('data/backups');
try {
  if (action === 'create') console.log(`Резервная копия: ${createBackup(databasePath, backupDirectory)}`);
  else if (action === 'restore' && backupFile && confirmation === '--confirm') console.log(`Восстановлено. Предыдущее состояние сохранено: ${restoreBackup(databasePath, backupFile, backupDirectory)}`);
  else { console.error('Использование: npm run backup -- create | npm run backup -- restore <файл> --confirm. Остановите сервер перед восстановлением.'); process.exitCode = 1; }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }

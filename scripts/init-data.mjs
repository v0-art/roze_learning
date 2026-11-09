import fs from 'node:fs';
const source='data/nexus_seed.json',target='data/nexus_academy.json';
if(fs.existsSync(target)){console.log('Рабочий файл данных уже существует и не изменён.');process.exit(0)}
fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
console.log('Создан рабочий файл из обезличенного исходного набора.');

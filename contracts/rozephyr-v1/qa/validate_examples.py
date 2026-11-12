#!/usr/bin/env python3
"""Rozephyr v1.0 illustrative schema validator; not a pedagogical evaluator."""
import sys, json, zipfile
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
S=Path(__file__).resolve().parent.parent/'schemas'
def schema(name):return json.loads((S/name).read_text(encoding='utf-8'))
def check(obj, filename):
    errors=list(Draft202012Validator(schema(filename),format_checker=FormatChecker()).iter_errors(obj))
    if errors:
        for error in errors: print('ERROR',filename,':', '/'.join(map(str,error.absolute_path)),error.message)
        return False
    return True
def safe(name):return bool(name and not name.startswith('/') and not name.startswith('\\') and all(x not in ('..','') for x in name.split('/')) and '\\' not in name)
def inspect(path):
    if path.suffix=='.json':
        obj=json.loads(path.read_text(encoding='utf-8'));return check(obj,'report.schema.json')
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if any(not safe(n) for n in names):print('ERROR unsafe archive path');return False
        if len(names)>1000:print('ERROR too many files');return False
        if sum(i.file_size for i in z.infolist())>80*1024*1024:print('ERROR archive uncompressed too large');return False
        if 'manifest.json' in names:
            m=json.loads(z.read('manifest.json').decode('utf-8'))
            if m.get('format')=='rozephyr-content':
                valid=check(m,'content-manifest.schema.json')
                for e in m.get('entries',[]):
                    if e.get('path') not in names:print('ERROR missing',e.get('path'));valid=False;continue
                    obj=json.loads(z.read(e['path']).decode('utf-8'))
                    s='curriculum-plan.schema.json' if e['kind']=='curriculum_plan' else 'content-entity.schema.json'
                    valid=check(obj,s) and valid
                    if e['kind']=='lesson':
                        for b in obj.get('content',{}).get('blocks',[]):
                            if b.get('textPath') not in names:print('ERROR missing',b.get('textPath')); valid=False
                return valid
            if m.get('format')=='rozephyr-session':
                valid=check(m,'session-manifest.schema.json')
                for f in m.get('files',[]):
                    if f not in names:print('ERROR missing',f);valid=False
                if 'context.json' in names:valid=check(json.loads(z.read('context.json').decode('utf-8')),'session-context.schema.json') and valid
                return valid
        if 'report.json' in names:return check(json.loads(z.read('report.json').decode('utf-8')),'report.schema.json')
        print('ERROR unknown ZIP package');return False
if __name__=='__main__':
    good=True
    for name in sys.argv[1:]:
        p=Path(name)
        try:passed=inspect(p)
        except Exception as exc:print('ERROR',p,exc);passed=False
        print(('PASS' if passed else 'FAIL'),p)
        good=good and passed
    sys.exit(0 if good else 1)

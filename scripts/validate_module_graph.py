#!/usr/bin/env python3
"""Independent offline validator; the original referenced validator was not supplied."""
import json, sys
from collections import Counter
from pathlib import Path
p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('data/module_graph_v1.json')
g = json.loads(p.read_text(encoding='utf-8')); nodes=g['nodes']; edges=g['edges']; ids={n['id'] for n in nodes}
assert len(nodes)==len(ids)==18 and ids=={f'M{i:02}' for i in range(1,19)}
assert len(edges)==len({e['id'] for e in edges})==97
assert Counter(e['relation'] for e in edges)=={'prerequisite':40,'application':36,'complementary':4,'capstone-integration':17}
assert Counter(e['displayTier'] for e in edges)=={'overview':22,'focus':75}
assert Counter(e['evidenceStatus'] for e in edges)=={'mentioned-in-passport-v0.6':67,'expert-proposed-extension':30}
assert sum(e['relation']=='capstone-integration' and e['target']=='M18' for e in edges)==17
assert all(e['source'] in ids and e['target'] in ids and e['source']!=e['target'] and e['id']==e['source']+'__'+e['target'] and e['approvalStatus']=='proposed' and e['isAccessGate'] is False and e['directionality']==('undirected' if e['relation']=='complementary' else 'source-to-target') and e['knowledgeTransfers'] and all(t['sourceKnowledge'].strip() and t['targetApplication'].strip() for t in e['knowledgeTransfers']) for e in edges)
seen={'M01'}
while True:
    added={v for e in edges if e['displayTier']=='overview' for u,v in ((e['source'],e['target']),(e['target'],e['source'])) if u in seen}-seen
    if not added: break
    seen |= added
assert seen==ids, 'overview is disconnected'
adj={i:[] for i in ids}
for e in edges:
    if e['relation']=='prerequisite': adj[e['source']].append(e['target'])
visiting=set(); done=set()
def visit(n):
    assert n not in visiting, 'prerequisite cycle'
    if n in done:return
    visiting.add(n)
    for v in adj[n]:visit(v)
    visiting.remove(n);done.add(n)
for node in ids:visit(node)
print('OK: 18 модулей, 97 связей, 22 обзорные; связность, типы, происхождение, M18 и ацикличность проверены')

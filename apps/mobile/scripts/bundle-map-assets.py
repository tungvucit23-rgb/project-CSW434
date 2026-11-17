"""Regenerate inline map assets from the pinned upstream text files beside bundled.ts."""
from pathlib import Path
import json

vendor = Path(__file__).resolve().parents[1] / 'src/map/vendor'
assets = [('leafletJs', 'leaflet.js.txt'), ('leafletCss', 'leaflet.css.txt'), ('clusterJs', 'markercluster.js.txt'), ('clusterCss', 'markercluster.css.txt')]
out = '// Generated from vendored Leaflet 1.9.4 (BSD-2-Clause) and markercluster 1.5.3 (MIT). See README.md and licenses.\n'
for name, file in assets:
    content = (vendor / file).read_text(encoding='utf-8-sig')
    # An upstream closing tag must never terminate an enclosing iframe script/style.
    content = content.replace('</script', '<\\/script').replace('</style', '<\\/style')
    out += 'export const ' + name + ' = ' + json.dumps(content, ensure_ascii=True) + ';\n'
(vendor / 'bundled.ts').write_text(out, encoding='utf-8')

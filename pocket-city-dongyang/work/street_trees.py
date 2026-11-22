"""Add illustrative street trees along road edges to a Pocket City scene.json.

usage: python3 street_trees.py scene.json SPACING OFFSET
Trees go OFFSET m outside each carriageway edge, SPACING m apart, never on a road,
inside a building, in water, or within 4 m of another tree. Species name "Street tree".
"""
import json, sys
from shapely.geometry import Polygon, Point, box
from shapely.ops import unary_union

path, spacing, offset = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
s = json.load(open(path))
half = s['meta']['half']


def polys(poly_list):   # each entry is a polygon: [outer ring, hole, ...]
    return [Polygon(p[0], [h for h in p[1:] if len(h) >= 3]).buffer(0) for p in poly_list if len(p[0]) >= 3]


roads = unary_union(polys(s['roads']))
water = unary_union(polys(s['water'])) if s['water'] else Polygon()
blds = unary_union([Polygon(b['ring']).buffer(0) for b in s['buildings']]).buffer(1.5)
inner = box(-half + 2, -half + 2, half - 2, half - 2)

if 'Street tree' not in s['species']:
    s['species'].append('Street tree')
sp = s['species'].index('Street tree')
existing = [Point(t[0], t[1]) for t in s['trees']]
ring = roads.buffer(offset, join_style=2)
lines = []
for g in getattr(ring, 'geoms', [ring]):
    lines.append(g.exterior)
    lines.extend(g.interiors)

added = []
for ln in lines:
    d = spacing / 2
    while d < ln.length:
        p = ln.interpolate(d)
        d += spacing
        if not inner.contains(p) or roads.buffer(0.8).contains(p) or blds.contains(p) or water.buffer(1).contains(p):
            continue
        if any(p.distance(q) < 4 for q in existing):
            continue
        existing.append(p)
        added.append([round(p.x, 2), round(p.y, 2), sp, ''])

s['trees'].extend(added)
json.dump(s, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'added {len(added)} street trees; total trees {len(s["trees"])}')

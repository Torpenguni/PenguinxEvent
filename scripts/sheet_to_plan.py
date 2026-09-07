#!/usr/bin/env python3
"""แปลงผังที่วาดในชีต Google ให้เป็นพิกัดบูธ

ทีมวาดผังด้วยการ merge ช่องตาราง แล้วพิมพ์ "A11 ล่าเมียว" ลงไป
สคริปต์นี้อ่านชีตที่ export เป็นตาราง markdown แล้วคืนค่า
พิกัดกริดของทุกบูธ ตรงกับคอลัมน์ grid_x / grid_y / grid_w / grid_h
ในตาราง booth

วิธีใช้
    python3 scripts/sheet_to_plan.py booking.md > plan.json
"""
import json
import re
import sys
from collections import deque

# ป้ายที่เป็นพื้นที่ ไม่ใช่บูธที่ขายได้
AREAS = {
    'TRC STAGE', 'X2 Exclusive Activity Area', 'washing', 'Food Zone',
    'Food Suppliers', 'Food Ingredient', 'Berverage Service',
    'Restaurant Service', 'Rest Area',
}
CODE = re.compile(r'^([A-Z]\d{1,2}(?:,\s*[A-Z]\d{1,2})*)\s*(.*)$')


def read_grid(path):
    """อ่านตาราง markdown เป็นกริดสองมิติ ช่องที่ merge จะซ้ำค่าเดิมทุกช่อง"""
    grid = []
    for line in open(path, encoding='utf-8'):
        if not line.strip():
            grid.append([])
            continue
        cells = [c.strip().replace('\\', '') for c in line.split('|')]
        if cells and cells[0] == '':
            cells = cells[1:]
        if cells and cells[-1] == '':
            cells = cells[:-1]
        # ข้ามแถวคั่นหัวตารางของ markdown
        if any(':' in c and set(c) <= set(':- ') for c in cells):
            continue
        grid.append([c.replace('[merged]', '').strip() for c in cells])
    width = max((len(r) for r in grid), default=0)
    for row in grid:
        row.extend([''] * (width - len(row)))
    return grid, width, len(grid)


def blocks(grid, width, height):
    """หากลุ่มช่องที่ติดกันและมีค่าเดียวกัน หนึ่งกลุ่มคือหนึ่งบูธ

    ใช้การไล่เพื่อนบ้านแทนการหากรอบครอบ เพราะไฟล์เดียวมักมีหลายแท็บ
    ต่อกัน ป้ายเดียวกันจึงโผล่คนละที่ได้ การหากรอบครอบจะรวมมันเป็น
    ก้อนเดียวที่ใหญ่ผิดรูป
    """
    seen = [[False] * width for _ in range(height)]
    out = []
    for y in range(height):
        for x in range(width):
            if seen[y][x] or not grid[y][x]:
                continue
            value = grid[y][x]
            queue = deque([(x, y)])
            seen[y][x] = True
            cells = []
            while queue:
                cx, cy = queue.popleft()
                cells.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if (0 <= nx < width and 0 <= ny < height
                            and not seen[ny][nx] and grid[ny][nx] == value):
                        seen[ny][nx] = True
                        queue.append((nx, ny))
            xs = [c[0] for c in cells]
            ys = [c[1] for c in cells]
            out.append({'v': value, 'x': min(xs), 'y': min(ys),
                        'w': max(xs) - min(xs) + 1, 'h': max(ys) - min(ys) + 1})
    return out


def latest_tab(comps, grid):
    """เลือกแท็บที่มีชื่อผู้เช่าครบที่สุด แท็บคั่นด้วยแถวว่างทั้งแถว"""
    breaks = [y for y, row in enumerate(grid) if not any(row)]
    edges = breaks + [len(grid)]
    best, best_named = [], -1
    for start, end in zip(edges, edges[1:]):
        chunk = [c for c in comps if start < c['y'] < end]
        named = sum(1 for c in chunk
                    if (m := CODE.match(c['v'])) and m.group(2).strip())
        if named > best_named:
            best, best_named = chunk, named
    return best


def main(path):
    grid, width, height = read_grid(path)
    chunk = latest_tab(blocks(grid, width, height), grid)
    if not chunk:
        sys.exit('ไม่พบบล็อกในไฟล์')
    top = min(c['y'] for c in chunk)
    booths, areas = [], []
    for c in chunk:
        c['y'] -= top
        if c['v'] in AREAS:
            areas.append({'name': c['v'], 'x': c['x'], 'y': c['y'],
                          'w': c['w'], 'h': c['h']})
            continue
        m = CODE.match(c['v'])
        if not m:
            continue
        codes, name = m.group(1), m.group(2).strip()
        booths.append({
            'code': codes,
            'key': codes.split(',')[0].strip(),
            'zone': codes[0],
            'name': name or None,
            'x': c['x'], 'y': c['y'], 'w': c['w'], 'h': c['h'],
            'size': f"{c['w']}x{c['h']} m",
            'sqm': c['w'] * c['h'],
            # ชีตผังไม่มีคอลัมน์สถานะ สีเซลล์คือสถานะและอ่านไม่ได้จากไฟล์นี้
            # จึงเดาจากการมีชื่อผู้เช่า ต้องให้ทีมยืนยันอีกที
            'status': 'sold' if name else 'available',
        })
    booths.sort(key=lambda b: (b['zone'], int(re.sub(r'\D', '', b['key']) or 0)))
    json.dump({'booths': booths, 'areas': areas}, sys.stdout,
              ensure_ascii=False, indent=1)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])

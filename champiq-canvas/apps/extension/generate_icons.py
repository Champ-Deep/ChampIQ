"""Generate simple PNG icons for the extension."""
import struct, zlib, os

def make_png(size, r, g, b):
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)

    w = h = size
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            # Simple gradient icon: dark background with lighter center
            cx, cy = w // 2, h // 2
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            max_dist = (w // 2)
            t = max(0, 1 - dist / max_dist)
            pr = int(r * t + 20 * (1 - t))
            pg = int(g * t + 20 * (1 - t))
            pb = int(b * t + 30 * (1 - t))
            raw += bytes([pr, pg, pb, 255])

    compressed = zlib.compress(raw)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    png = sig
    png += chunk(b'IHDR', ihdr_data)
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    return png

os.chdir(os.path.dirname(os.path.abspath(__file__)))
for size in [16, 48, 128]:
    with open(f'icon{size}.png', 'wb') as f:
        f.write(make_png(size, 99, 102, 241))  # indigo #6366f1
    print(f'Generated icon{size}.png')

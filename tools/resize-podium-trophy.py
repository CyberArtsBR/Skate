"""Resize only the supplied ceremony trophy's embedded textures.

Keeps geometry, material channels, transforms, extras and attribution intact.
Uses Pillow; this is an asset conversion tool, not a gameplay check or build.
"""
import io
import json
import struct
from pathlib import Path
from PIL import Image

path = Path(__file__).resolve().parents[1] / 'public/models/podium/trophy.glb'
data = path.read_bytes()
json_size = struct.unpack_from('<I', data, 12)[0]
document = json.loads(data[20:20 + json_size])
bin_start = 20 + json_size
bin_size, bin_type = struct.unpack_from('<II', data, bin_start)
assert bin_type == 0x004E4942
binary = data[bin_start + 8:bin_start + 8 + bin_size]
replacement = {}
for image in document.get('images', []):
    if 'bufferView' not in image:
        continue
    view = document['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    raw = binary[start:start + view['byteLength']]
    decoded = Image.open(io.BytesIO(raw))
    if max(decoded.size) <= 1024:
        continue
    decoded.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    encoded = io.BytesIO()
    # Lossless PNG retains normal/MR channel data after spatial resampling.
    decoded.save(encoded, format='PNG', optimize=True)
    replacement[image['bufferView']] = encoded.getvalue()
    image['mimeType'] = 'image/png'
if replacement:
    packed = bytearray()
    for index, view in enumerate(document['bufferViews']):
        start = view.get('byteOffset', 0)
        raw = replacement.get(index, binary[start:start + view['byteLength']])
        packed.extend(b'\0' * (-len(packed) % 4))
        view['byteOffset'] = len(packed)
        view['byteLength'] = len(raw)
        packed.extend(raw)
    document['buffers'][0]['byteLength'] = len(packed)
    packed.extend(b'\0' * (-len(packed) % 4))
    encoded_json = json.dumps(document, separators=(',', ':')).encode('utf-8')
    encoded_json += b' ' * (-len(encoded_json) % 4)
    output = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded_json) + len(packed))
    output += struct.pack('<II', len(encoded_json), 0x4E4F534A) + encoded_json
    output += struct.pack('<II', len(packed), 0x004E4942) + packed
    path.write_bytes(output)
    print(f'Trophy textures: 2048 to 1024; file {len(data):,} to {len(output):,} bytes.')
else:
    print('Trophy textures already at the intended size.')

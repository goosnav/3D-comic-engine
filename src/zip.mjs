// MP4s are already compressed. ZIP's stored method packages their original bytes
// without recompressing them or allocating one giant in-memory byte array.
const MAX_UINT32 = 0xffffffff;
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({length: 256}, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});

function checkAbort(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('ZIP download cancelled', 'AbortError');
}

async function checksum(blob, signal) {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    checkAbort(signal);
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  }
  checkAbort(signal);
  return (crc ^ 0xffffffff) >>> 0;
}

function header(length) {
  const bytes = new Uint8Array(length);
  return {bytes, view: new DataView(bytes.buffer)};
}

/** Create a ZIP of flat, unique filenames. Progress reports {completed,total,name}. */
export async function createZip(entries, {onProgress, signal} = {}) {
  checkAbort(signal);
  if (!Array.isArray(entries) || entries.length > 65534) throw Error('ZIP supports at most 65,534 files.');
  const names = new Set();
  let archiveSize = 22;
  const records = entries.map(entry => {
    if (!entry || typeof entry.name !== 'string' || !entry.name ||
        /[\/\\:\u0000-\u001f\u007f]/.test(entry.name) || ['.', '..'].includes(entry.name)) {
      throw Error('ZIP filenames must be plain filenames without folders or control characters.');
    }
    if (names.has(entry.name)) throw Error(`Duplicate ZIP filename: ${entry.name}`);
    names.add(entry.name);
    if (!(entry.blob instanceof Blob)) throw Error(`Missing file data for ${entry.name}`);
    const name = encoder.encode(entry.name);
    if (name.length > 65535) throw Error('ZIP filename is too long.');
    archiveSize += 30 + 46 + name.length * 2 + entry.blob.size;
    if (archiveSize >= MAX_UINT32) throw Error('This ZIP would exceed 4 GiB. Download the MP4s individually or select a smaller batch.');
    return {name, filename: entry.name, blob: entry.blob};
  });
  const parts = [], directory = [];
  let offset = 0;
  for (const [index, record] of records.entries()) {
    const {name, blob, filename} = record;
    const crc = await checksum(blob, signal);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true); // Version needed: ZIP 2.0.
    local.view.setUint16(6, 0x0800, true); // UTF-8 filenames.
    local.view.setUint16(12, 0x0021, true); // January 1, 1980; deterministic archive.
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, blob.size, true);
    local.view.setUint32(22, blob.size, true);
    local.view.setUint16(26, name.length, true);
    parts.push(local.bytes, name, blob);

    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(14, 0x0021, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, blob.size, true);
    central.view.setUint32(24, blob.size, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, offset, true);
    directory.push(central.bytes, name);
    offset += local.bytes.length + name.length + blob.size;
    onProgress?.({completed: index + 1, total: records.length, name: filename});
    checkAbort(signal);
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, records.length, true);
  end.view.setUint16(10, records.length, true);
  end.view.setUint32(12, directorySize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.bytes], {type: 'application/zip'});
}

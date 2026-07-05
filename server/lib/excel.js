const XLSX = require('xlsx');
const { normalizeCccd, normalizePhone, isValidCccd, isValidPhone } = require('./normalize');

const CORE_KEYS = ['cccd', 'full_name', 'unit', 'phone', 'email'];

// Header nhận diện cột lõi khi đọc file (không phân biệt hoa thường)
const HEADER_MATCH = {
  cccd: (h) => h.includes('cccd') || h.includes('căn cước') || h.includes('cmnd') || h.includes('cmt') || h.includes('id number') || h.includes('identity'),
  full_name: (h) => h.startsWith('họ') || h.includes('họ tên') || h === 'tên' || h.includes('full name') || h === 'name',
  unit: (h) => h.includes('đơn vị') || h.includes('cơ quan') || h === 'unit' || h.includes('organization'),
  phone: (h) => h.includes('điện thoại') || h === 'sđt' || h.includes('phone') || h.includes('mobile'),
  email: (h) => h.includes('email') || h.includes('thư điện tử'),
};

const SAMPLE = {
  cccd: ['001099012345', '001088054321'],
  full_name: ['Nguyễn Văn A', 'Trần Thị B'],
  unit: ['Phòng Kế hoạch', 'Phòng Tài chính'],
  phone: ['0912345678', '0987654321'],
  email: ['vana@example.com', 'thib@example.com'],
};

function cellValue(a, key) {
  if (key === 'stt') return a.stt;
  if (CORE_KEYS.includes(key)) return a[key] || '';
  return (a.extra && a.extra[key]) || '';
}

function widthOf(key) {
  if (key === 'stt') return 5;
  if (key === 'cccd') return 16;
  if (key === 'phone') return 15;
  if (key === 'full_name' || key === 'unit' || key === 'email') return 25;
  return 18;
}

// Ép các cột CCCD/SĐT về kiểu text để Excel không cắt số 0 đầu
function markTextColumns(ws, cols, dataRowCount) {
  cols.forEach((c, i) => {
    if (c.key !== 'cccd' && c.key !== 'phone') return;
    const letter = XLSX.utils.encode_col(i);
    for (let r = 2; r <= dataRowCount + 1; r++) {
      const addr = `${letter}${r}`;
      if (ws[addr]) { ws[addr].t = 's'; ws[addr].z = '@'; }
    }
  });
}

// Sinh template theo các cột đang bật (columns = [{key,label}], không gồm STT)
function buildTemplate(columns = []) {
  const cols = [{ key: 'stt', label: 'STT' }, ...columns];
  const header = cols.map((c) => c.label);
  const sample = (n) => cols.map((c) => (c.key === 'stt' ? n + 1 : (SAMPLE[c.key] ? SAMPLE[c.key][n] : '')));
  const ws = XLSX.utils.aoa_to_sheet([header, sample(0), sample(1)]);
  markTextColumns(ws, cols, 2);
  ws['!cols'] = cols.map((c) => ({ wch: widthOf(c.key) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Đọc file upload -> { rows, errors }. columns = [{key,label,required,kind}] các cột đang bật.
function parseAttendees(buffer, columns = []) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], errors: [{ row: 0, message: 'File không có sheet dữ liệu' }] };

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const cellsLower = (r) => r.map((c) => String(c).trim().toLowerCase());
  // Dòng tiêu đề = dòng đầu tiên có ô khớp cột "Họ và tên" (luôn bật)
  const headerIdx = raw.findIndex((r) => cellsLower(r).some((h) => HEADER_MATCH.full_name(h)));
  if (headerIdx === -1) {
    return { rows: [], errors: [{ row: 0, message: 'Không tìm thấy dòng tiêu đề (cột "Họ và tên") — hãy dùng file template' }] };
  }
  const header = cellsLower(raw[headerIdx]);
  const sttIdx = header.findIndex((h) => h === 'stt');
  // Vị trí cột cho từng trường đang bật
  const colIdx = columns.map((c) => {
    let idx = -1;
    if (c.kind === 'core' && HEADER_MATCH[c.key]) idx = header.findIndex((h) => HEADER_MATCH[c.key](h));
    else {
      // Trường custom: khớp theo nhãn tiếng Việt hoặc tiếng Anh
      const names = (c.matchNames && c.matchNames.length) ? c.matchNames : [String(c.label || '').toLowerCase()];
      idx = header.findIndex((h) => names.includes(h));
    }
    return { ...c, idx };
  });

  const rows = [];
  const errors = [];
  const seenCccd = new Map();
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    const line = i + 1;
    if (r.every((c) => String(c).trim() === '')) continue;

    const rec = { stt: null, cccd: null, full_name: null, unit: null, phone: null, email: null, extra: null };
    const extra = {};
    let rowError = null;

    for (const c of colIdx) {
      let v = c.idx >= 0 ? String(r[c.idx]).trim() : '';
      if (c.key === 'cccd') v = normalizeCccd(v);
      if (c.key === 'phone') v = normalizePhone(v);
      if (!v) {
        if (c.required) { rowError = `Thiếu ${c.label}`; break; }
        continue;
      }
      if (c.key === 'cccd' && !isValidCccd(v)) { rowError = `${c.label} "${v}" không hợp lệ (cần đủ 12 chữ số — kiểm tra ô có bị mất số 0 đầu)`; break; }
      if (c.key === 'phone' && !isValidPhone(v)) { rowError = `${c.label} "${v}" không hợp lệ`; break; }
      if (c.kind === 'core') rec[c.key] = v;
      else extra[c.key] = v.slice(0, 200);
    }
    if (rowError) { errors.push({ row: line, message: rowError }); continue; }

    // Chống trùng theo CCCD (nếu có cột CCCD và có giá trị)
    if (rec.cccd) {
      if (seenCccd.has(rec.cccd)) { errors.push({ row: line, message: `CCCD ${rec.cccd} trùng với dòng ${seenCccd.get(rec.cccd)}` }); continue; }
      seenCccd.set(rec.cccd, line);
    }

    rec.stt = parseInt(sttIdx >= 0 ? r[sttIdx] : '', 10) || rows.length + 1;
    rec.extra = Object.keys(extra).length ? extra : null;
    rows.push(rec);
  }
  return { rows, errors };
}

function formOf(a) {
  if (a.self_registered) return 'Ghi danh tự do';
  if (a.checkin_type === 'qr') return 'QR';
  if (a.checkin_type === 'manual') return 'BTC xác nhận';
  if (a.checkin_type === 'supplement') return 'Bổ sung';
  return '';
}

// Xuất kết quả. columns = [{key,label}] (không gồm STT); tự thêm cột dữ liệu cũ còn sót.
function buildExport(session, attendees, stats, columns = []) {
  const cols = [{ key: 'stt', label: 'STT' }, ...columns];
  const shown = new Set(cols.map((c) => c.key));
  attendees.forEach((a) => Object.keys(a.extra || {}).forEach((k) => {
    if (!shown.has(k)) { cols.push({ key: k, label: k }); shown.add(k); }
  }));

  const header = [...cols.map((c) => c.label), 'Trạng thái', 'Thời gian điểm danh', 'Hình thức'];
  const dataRows = [header, ...attendees.map((a) => [
    ...cols.map((c) => cellValue(a, c.key)),
    a.status === 'present' ? 'Có mặt' : 'Vắng',
    a.checked_in_at || '',
    formOf(a),
  ])];
  const ws = XLSX.utils.aoa_to_sheet(dataRows);
  markTextColumns(ws, cols, attendees.length);
  ws['!cols'] = [...cols.map((c) => ({ wch: widthOf(c.key) })), { wch: 12 }, { wch: 20 }, { wch: 14 }];

  const statsWs = XLSX.utils.aoa_to_sheet([
    ['Phiên điểm danh', session.name],
    ['Thời gian bắt đầu', session.opened_at || ''],
    ['Thời gian kết thúc', session.closed_at || ''],
    [session.type === 'open' ? 'Số người ghi danh' : 'Tổng số', session.type === 'open' ? stats.present : stats.total],
    ...(session.type === 'open' ? [] : [['Có mặt', stats.present], ['Vắng mặt', stats.absent], ['Tỉ lệ tham gia', `${stats.rate}%`]]),
  ]);
  statsWs['!cols'] = [{ wch: 22 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');
  XLSX.utils.book_append_sheet(wb, statsWs, 'ThongKe');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildTemplate, parseAttendees, buildExport };

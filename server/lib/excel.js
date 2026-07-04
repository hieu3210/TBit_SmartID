const XLSX = require('xlsx');
const { normalizeCccd, normalizePhone, isValidCccd, isValidPhone } = require('./normalize');

const HEADERS = ['STT', 'CCCD', 'Họ và tên', 'Đơn vị', 'Số điện thoại', 'Email'];

// Sinh file template mẫu (kèm các trường bổ sung do admin cấu hình)
function buildTemplate(extraFields = []) {
  const pad = extraFields.map(() => '');
  const rows = [
    [...HEADERS, ...extraFields],
    [1, '001099012345', 'Nguyễn Văn A', 'Phòng Kế hoạch', '0912345678', 'vana@example.com', ...pad],
    [2, '001088054321', 'Trần Thị B', 'Phòng Tài chính', '0987654321', 'thib@example.com', ...pad],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Ép CCCD và SĐT của dòng mẫu về kiểu text để Excel không cắt số 0 đầu
  ['B2', 'E2', 'B3', 'E3'].forEach((addr) => { ws[addr].t = 's'; ws[addr].z = '@'; });
  ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
    ...extraFields.map(() => ({ wch: 18 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Đọc file upload -> { rows: [...], errors: [{row, message}] }
function parseAttendees(buffer, extraFields = []) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], errors: [{ row: 0, message: 'File không có sheet dữ liệu' }] };

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Tìm dòng tiêu đề (dòng chứa "CCCD")
  const headerIdx = raw.findIndex((r) => r.some((c) => String(c).trim().toUpperCase() === 'CCCD'));
  if (headerIdx === -1) {
    return { rows: [], errors: [{ row: 0, message: 'Không tìm thấy dòng tiêu đề chứa cột CCCD — hãy dùng file template' }] };
  }
  const header = raw[headerIdx].map((c) => String(c).trim().toLowerCase());
  const col = (name) => header.findIndex((h) => h === name.toLowerCase());
  const idx = {
    stt: col('STT'),
    cccd: col('CCCD'),
    name: header.findIndex((h) => h.startsWith('họ')),
    unit: header.findIndex((h) => h.startsWith('đơn vị')),
    phone: header.findIndex((h) => h.startsWith('số điện thoại') || h === 'sđt'),
    email: col('Email'),
  };
  if (idx.name === -1) return { rows: [], errors: [{ row: headerIdx + 1, message: 'Thiếu cột "Họ và tên"' }] };
  // Vị trí cột của các trường bổ sung (khớp theo tên cột, không phân biệt hoa thường)
  const extraIdx = extraFields.map((f) => ({ label: f, col: col(f) }));

  const rows = [];
  const errors = [];
  const seen = new Map(); // cccd -> dòng đầu tiên
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    const line = i + 1; // số dòng Excel (1-based)
    const isEmpty = r.every((c) => String(c).trim() === '');
    if (isEmpty) continue;

    const cccd = normalizeCccd(idx.cccd >= 0 ? r[idx.cccd] : '');
    const fullName = String(idx.name >= 0 ? r[idx.name] : '').trim();
    const phone = normalizePhone(idx.phone >= 0 ? r[idx.phone] : '');

    if (!fullName) { errors.push({ row: line, message: 'Thiếu Họ và tên' }); continue; }
    if (!isValidCccd(cccd)) { errors.push({ row: line, message: `CCCD "${cccd || '(trống)'}" không hợp lệ (cần đủ 12 chữ số — kiểm tra ô có bị mất số 0 đầu)` }); continue; }
    if (!isValidPhone(phone)) { errors.push({ row: line, message: `Số điện thoại "${phone || '(trống)'}" không hợp lệ` }); continue; }
    if (seen.has(cccd)) { errors.push({ row: line, message: `CCCD ${cccd} trùng với dòng ${seen.get(cccd)}` }); continue; }
    seen.set(cccd, line);

    const extra = {};
    extraIdx.forEach(({ label, col: c }) => {
      const v = c >= 0 ? String(r[c]).trim() : '';
      if (v) extra[label] = v;
    });

    rows.push({
      stt: parseInt(idx.stt >= 0 ? r[idx.stt] : '', 10) || rows.length + 1,
      cccd,
      full_name: fullName,
      unit: String(idx.unit >= 0 ? r[idx.unit] : '').trim() || null,
      phone,
      email: String(idx.email >= 0 ? r[idx.email] : '').trim() || null,
      extra: Object.keys(extra).length ? extra : null,
    });
  }
  return { rows, errors };
}

// Xuất kết quả điểm danh
function buildExport(session, attendees, stats, extraFields = []) {
  // Cột bổ sung: theo cấu hình hiện tại + các trường cũ còn trong dữ liệu (nếu cấu hình đã đổi)
  const extraCols = [...extraFields];
  attendees.forEach((a) => {
    Object.keys(a.extra || {}).forEach((k) => { if (!extraCols.includes(k)) extraCols.push(k); });
  });
  const dataRows = [
    [...HEADERS, ...extraCols, 'Trạng thái', 'Thời gian điểm danh', 'Hình thức'],
    ...attendees.map((a) => [
      a.stt, a.cccd, a.full_name, a.unit || '', a.phone || '', a.email || '',
      ...extraCols.map((k) => (a.extra && a.extra[k]) || ''),
      a.status === 'present' ? 'Có mặt' : 'Vắng',
      a.checked_in_at || '',
      a.checkin_type === 'qr' ? 'QR' : a.checkin_type === 'manual' ? 'BTC xác nhận' : a.checkin_type === 'supplement' ? 'Bổ sung' : '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(dataRows);
  attendees.forEach((a, i) => {
    const row = i + 2;
    [`B${row}`, `E${row}`].forEach((addr) => { if (ws[addr]) { ws[addr].t = 's'; ws[addr].z = '@'; } });
  });
  ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
    ...extraCols.map(() => ({ wch: 18 })), { wch: 12 }, { wch: 20 }, { wch: 14 }];

  const statsWs = XLSX.utils.aoa_to_sheet([
    ['Phiên điểm danh', session.name],
    ['Thời gian bắt đầu', session.opened_at || ''],
    ['Thời gian kết thúc', session.closed_at || ''],
    ['Tổng số', stats.total],
    ['Có mặt', stats.present],
    ['Vắng mặt', stats.absent],
    ['Tỉ lệ tham gia', `${stats.rate}%`],
  ]);
  statsWs['!cols'] = [{ wch: 22 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');
  XLSX.utils.book_append_sheet(wb, statsWs, 'ThongKe');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { HEADERS, buildTemplate, parseAttendees, buildExport };

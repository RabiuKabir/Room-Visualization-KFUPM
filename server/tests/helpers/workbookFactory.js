import ExcelJS from 'exceljs';

export async function buildWorkbookBuffer({
  worksheetName = 'Schedule',
  headerRowIndex = 1,
  headers,
  rows,
}) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(worksheetName);

  for (let index = 1; index < headerRowIndex; index += 1) {
    worksheet.addRow([`Preface ${index}`]);
  }

  worksheet.addRow(headers);

  rows.forEach((row) => {
    if (Array.isArray(row)) {
      worksheet.addRow(row);
      return;
    }

    worksheet.addRow(headers.map((header) => row[header] ?? ''));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildConflictWorkbookBuffer() {
  return buildWorkbookBuffer({
    worksheetName: 'Assignments',
    headerRowIndex: 3,
    headers: [
      'Subj',
      'Course Number',
      'Course Title',
      'Section',
      'Type',
      'Day',
      'Begin Time',
      'End Time',
      'Building',
      'Assigned Room',
    ],
    rows: [
      {
        Subj: 'CS',
        'Course Number': '101',
        'Course Title': 'Intro Programming',
        Section: '01',
        Type: 'LEC',
        Day: 'MW',
        'Begin Time': '09:00',
        'End Time': '10:00',
        Building: 'B1',
        'Assigned Room': '101',
      },
      {
        Subj: 'MATH',
        'Course Number': '201',
        'Course Title': 'Calculus I',
        Section: '02',
        Type: 'LEC',
        Day: 'MW',
        'Begin Time': '0930',
        'End Time': '1030',
        Building: 'B1',
        'Assigned Room': '101',
      },
      {
        Subj: 'CHEM',
        'Course Number': '220',
        'Course Title': 'Organic Lab',
        Section: '03',
        Type: 'LAB',
        Day: 'MW',
        'Begin Time': 0.5,
        'End Time': 0.625,
        Building: 'B1',
        'Assigned Room': '102',
      },
    ],
  });
}

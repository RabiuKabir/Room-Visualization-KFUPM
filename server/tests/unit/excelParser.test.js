import { describe, expect, test } from '@jest/globals';

import { parseWorkbookBuffer } from '../../services/excelParser.js';
import { buildWorkbookBuffer } from '../helpers/workbookFactory.js';

describe('excelParser', () => {
  test('detects non-first header rows and flexible column names', async () => {
    const buffer = await buildWorkbookBuffer({
      headerRowIndex: 4,
      headers: [
        'Subj',
        'Course Number',
        'Course Title',
        'Section',
        'Type',
        'Meeting Days',
        'Start Time',
        'End Time',
        'Building',
        'Assigned Room',
      ],
      rows: [
        {
          Subj: 'EE',
          'Course Number': '201',
          'Course Title': 'Signals',
          Section: '05',
          Type: 'LEC',
          'Meeting Days': 'Tue/Thu',
          'Start Time': 0.375,
          'End Time': 0.4583333333,
          Building: 'ENG',
          'Assigned Room': '210',
        },
      ],
    });

    const parsed = await parseWorkbookBuffer(buffer);

    expect(parsed.metadata.headerRowIndex).toBe(4);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].course_id).toBe('EE-201-05');
    expect(parsed.records[0].days_list).toEqual(['T', 'R']);
    expect(parsed.records[0].start_min).toBe(540);
    expect(parsed.records[0].end_min).toBe(660);
  });
});

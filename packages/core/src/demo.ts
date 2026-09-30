// Example data for "Load example". Every record is flagged demo and the UI labels it.
// Receipt numbers are all zeros so they cannot match a real case.
import { addDays, addMonths, type LocalDate } from './dates.ts';
import type { AppData, Case, Deadline, IdFactory, Instant, Series, VisaData } from './model.ts';

const at = (date: LocalDate, hour = 14) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;

export function exampleData(
  on: LocalDate,
  makeId: IdFactory,
  now: Instant,
): Omit<AppData, 'prefs' | 'checklists' | 'sourceChecks' | 'fees'> {
  const filed1 = addDays(on, -212);
  const interviewEvent = addDays(on, -3);
  const events1 = [
    { code: 'IAF', at: at(filed1) },
    { code: 'FNA', at: at(addDays(filed1, 18)) },
    { code: 'FTA0', at: at(addDays(filed1, 46)) },
    { code: 'FS', at: at(addDays(filed1, 120)) },
    { code: 'FI', at: at(interviewEvent, 16) },
  ];
  const case1: Case = {
    id: makeId(),
    receipt: 'IOE0000000001',
    form: 'I-485',
    owner: 'Alex',
    receivedDate: filed1,
    processingMonths: 14,
    notes: '',
    manual: [],
    uscis: {
      lastSyncedAt: now,
      submittedAt: at(filed1, 13),
      channel: 'Online',
      events: events1,
      notices: [
        {
          actionType: 'Receipt notice',
          generationDate: at(addDays(filed1, 1)),
          letterId: 'DEMO-0001',
        },
        {
          actionType: 'Interview appointment',
          generationDate: at(interviewEvent, 16),
          appointmentDateTime: at(addDays(on, 21), 15),
          letterId: 'DEMO-0002',
        },
      ],
      knownKeys: events1.map((e) => `${e.code}|${e.at}`),
      newKeys: [`FI|${at(interviewEvent, 16)}`],
    },
    demo: true,
    createdAt: now,
    updatedAt: now,
  };

  const filed2 = addDays(on, -150);
  const events2 = [
    { code: 'IAF', at: at(filed2) },
    { code: 'FTA0', at: at(addDays(filed2, 31)) },
    { code: 'DA', at: at(addDays(filed2, 138)) },
    { code: 'LAA', at: at(addDays(filed2, 140)) },
  ];
  const case2: Case = {
    id: makeId(),
    receipt: 'IOE0000000002',
    form: 'I-765',
    owner: 'Alex',
    receivedDate: filed2,
    processingMonths: 7,
    notes: '',
    manual: [],
    uscis: {
      lastSyncedAt: now,
      submittedAt: at(filed2, 13),
      events: events2,
      notices: [],
      knownKeys: events2.map((e) => `${e.code}|${e.at}`),
      newKeys: [],
    },
    demo: true,
    createdAt: now,
    updatedAt: now,
  };

  const filed3 = addDays(on, -420);
  const case3: Case = {
    id: makeId(),
    receipt: 'MSC0000000003',
    form: 'I-130',
    owner: 'Sam',
    receivedDate: filed3,
    processingMonths: 12,
    notes: 'Example notes. Your notes save as you type.',
    manual: [
      { id: makeId(), date: filed3, status: 'received', createdAt: now },
      {
        id: makeId(),
        date: addDays(filed3, 95),
        status: 'transferred',
        note: 'Transferred to the National Benefits Center.',
        createdAt: now,
      },
      { id: makeId(), date: addDays(filed3, 300), status: 'review', createdAt: now },
    ],
    demo: true,
    createdAt: now,
    updatedAt: now,
  };

  const deadlines: Deadline[] = [
    {
      id: makeId(),
      caseId: case1.id,
      title: 'Interview appointment',
      date: addDays(on, 21),
      done: false,
      createdAt: now,
    },
    {
      id: makeId(),
      caseId: case1.id,
      title: 'Request certified birth certificate translation',
      date: addDays(on, 7),
      done: false,
      createdAt: now,
    },
  ];

  const monthly = (months: number, start: number, step: (i: number) => number): Series['points'] =>
    Array.from({ length: months }, (_, i) => ({
      date: addMonths(`${on.slice(0, 7)}-01`, i - months + 1),
      value: Math.round((start + step(i)) * 10) / 10,
    }));

  const series: Series[] = [
    {
      id: makeId(),
      name: 'I-485 demo office',
      demo: true,
      points: monthly(18, 11, (i) => i * 0.2 + (i % 4 === 0 ? 0.6 : 0)),
    },
    {
      id: makeId(),
      name: 'I-765 demo',
      demo: true,
      points: monthly(18, 6.5, (i) => (i % 5) * 0.3 - i * 0.05),
    },
  ];

  const bulletinStart = addMonths(`${on.slice(0, 7)}-01`, -13);
  const visa: VisaData = {
    priorityDate: addMonths(on, -30),
    category: 'Demo category',
    demo: true,
    cutoffs: Array.from({ length: 14 }, (_, i) => ({
      month: addMonths(bulletinStart, i).slice(0, 7),
      cutoff: addDays(addMonths(on, -58), i * 32 + (i > 8 ? 20 : 0)),
    })),
  };

  return { cases: [case1, case2, case3], deadlines, series, visa };
}

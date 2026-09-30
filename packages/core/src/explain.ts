// Plain-language explanations of USCIS events: what an event is, why it happens, what it is for,
// and what usually comes next. Event codes are community documented, so every claim here stays
// general and hedged. Nothing below is specific to one code; copy is per kind of event.
import { OFFICIAL_CODE_PREFIX } from './official.ts';
import type { EventInfo } from './events.ts';
import { STATUSES, type Tone } from './statuses.ts';

/** Stages of the usual path of a case, in order. */
export const PIPELINE_STAGES = ['intake', 'checks', 'review', 'decision', 'card'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  intake: 'Intake',
  checks: 'Checks',
  review: 'Officer review',
  decision: 'Decision',
  card: 'Card',
};

/**
 * Notice: USCIS usually pairs the event with a mailed notice or a visible status change.
 * Silent: background activity that usually appears only in the case data.
 */
export type EventSignal = 'notice' | 'silent';

export const SIGNAL_LABELS: Record<EventSignal, string> = {
  notice: 'Notice',
  silent: 'Background',
};

export const SIGNAL_DESCRIPTIONS: Record<EventSignal, string> = {
  notice: 'USCIS usually pairs these events with a mailed notice or a visible status change.',
  silent: 'Background activity that usually appears only in the case data, without a notice.',
};

export interface EventExplanation {
  stage: PipelineStage;
  signal: EventSignal;
  tone: Tone;
  /** What the event is. */
  what: string;
  /** Why USCIS records it. */
  why: string;
  /** What it is for. */
  purpose: string;
  /** What usually comes next. */
  next: string;
  /** True for events from the official Case Status API, false for community dictionary events. */
  official: boolean;
}

type Variant =
  | 'receipt'
  | 'biometrics'
  | 'background'
  | 'interview'
  | 'interview_update'
  | 'processing'
  | 'transferred'
  | 'hold'
  | 'approved'
  | 'card_prod'
  | 'card_mailed'
  | 'card_delivered'
  | 'rfe'
  | 'rfe_resp'
  | 'noid'
  | 'denied'
  | 'closed'
  | 'unknown';

interface Copy {
  stage: PipelineStage;
  signal: EventSignal;
  what: string;
  why: string;
  purpose: string;
  next: string;
}

// Each sentence stays under about 150 characters. Hedge behavior with "usually" or "often".
const COPY: Record<Variant, Copy> = {
  receipt: {
    stage: 'intake',
    signal: 'notice',
    what: 'Community sources link this code to USCIS accepting a filing and creating the case.',
    why: 'USCIS gives each accepted filing a receipt number and usually mails a receipt notice.',
    purpose: 'It confirms USCIS accepted the filing and gives you the number that tracks the case.',
    next: 'A biometrics notice if your form needs one, then the case usually waits for review.',
  },
  biometrics: {
    stage: 'checks',
    signal: 'notice',
    what: 'Community sources link this code to a biometrics appointment for fingerprints and a photo.',
    why: 'Many forms need fingerprints, a photo, and sometimes a signature so USCIS can verify who you are.',
    purpose: 'Biometrics support identity checks and fingerprint-based background checks.',
    next: 'Attend with the appointment notice and photo ID. The case then continues review.',
  },
  background: {
    stage: 'checks',
    signal: 'silent',
    what: 'Community sources link this code to a background or security check on the case.',
    why: 'USCIS usually runs identity, criminal history, and security checks before it decides a case.',
    purpose:
      'The checks help USCIS confirm identity and spot issues that affect eligibility or security.',
    next: 'Often nothing visible. The case usually stays in review until an interview notice, an evidence request, or a decision.',
  },
  interview: {
    stage: 'review',
    signal: 'notice',
    what: 'Community sources link this code to an interview being scheduled with USCIS.',
    why: 'Some forms require an interview so an officer can ask questions about the case and documents.',
    purpose: 'The interview lets an officer confirm your answers and documents before a decision.',
    next: 'Attend with the documents on the notice. A decision may come at or after the interview.',
  },
  interview_update: {
    stage: 'review',
    signal: 'silent',
    what: 'Community sources group this code with interview activity. The dictionary does not say which step it records.',
    why: 'Interviews involve scheduling, results, and follow-up, so the record can change without a new notice.',
    purpose: 'It keeps the interview step of the case record current inside USCIS.',
    next: 'Check your notices for a new interview date or a request. Otherwise the case usually stays in review.',
  },
  processing: {
    stage: 'review',
    signal: 'silent',
    what: 'Community sources describe this code as a routine processing update while the case is in review.',
    why: 'USCIS updates a case record as the case moves between processing steps.',
    purpose:
      'It records progress inside USCIS. It does not say by itself how the case will be decided.',
    next: 'Often nothing visible. An interview notice, an evidence request, or a decision may come later.',
  },
  transferred: {
    stage: 'review',
    signal: 'notice',
    what: 'Community sources link this code to the case moving to another office.',
    why: 'USCIS moves cases between offices to balance workloads or to handle an interview.',
    purpose: 'It shows that another office now handles the case, so that office may set the pace.',
    next: 'Review continues at the new office. Watch your notices for a new address or appointment.',
  },
  hold: {
    stage: 'review',
    signal: 'silent',
    what: 'Community sources link this code to a case on hold or pending an internal review.',
    why: 'A case can wait on an internal step, such as a check or a review, before the next action.',
    purpose:
      'It marks that the case is waiting inside USCIS. The case data does not say for what or how long.',
    next: 'Often nothing you need to do. Watch your notices in case USCIS asks for something.',
  },
  approved: {
    stage: 'decision',
    signal: 'notice',
    what: 'Community sources link this code to USCIS approving the case.',
    why: 'An officer decided the case met the requirements and recorded the decision.',
    purpose: 'It records the decision. USCIS usually mails an approval notice.',
    next: 'Watch for the approval notice by mail. If a card is issued, card production follows.',
  },
  card_prod: {
    stage: 'card',
    signal: 'notice',
    what: 'Community sources link this code to USCIS ordering your card.',
    why: 'After approvals that include a card, USCIS orders it from a card production facility.',
    purpose: 'It starts card production so the card can be mailed.',
    next: 'The card is usually mailed within a few weeks. A mailing update usually follows.',
  },
  card_mailed: {
    stage: 'card',
    signal: 'notice',
    what: 'Community sources link this code to USCIS mailing your card.',
    why: 'USCIS usually sends a finished card by USPS to the address on file.',
    purpose: 'It tells you the card left USCIS so you can watch for delivery.',
    next: 'Delivery by USPS, often with a tracking number in the case status.',
  },
  card_delivered: {
    stage: 'card',
    signal: 'notice',
    what: 'Community sources link this code to delivery of your card.',
    why: 'USPS reports delivery of the card to the address on file.',
    purpose: 'It confirms the card reached its destination.',
    next: 'Nothing further on this case. Check the card for errors.',
  },
  rfe: {
    stage: 'review',
    signal: 'notice',
    what: 'Community sources link this code to USCIS requesting more evidence (RFE).',
    why: 'USCIS asks for more documents or information when the filing does not yet support a decision.',
    purpose:
      'It pauses the decision until you respond. The notice lists what is missing and the deadline.',
    next: 'Respond by the deadline on the notice. Review resumes after USCIS receives your response.',
  },
  rfe_resp: {
    stage: 'review',
    signal: 'notice',
    what: 'Community sources link this code to USCIS receiving your evidence response.',
    why: 'USCIS logs a response when it arrives so review can resume.',
    purpose: 'It confirms USCIS has your response and that an officer can review it.',
    next: 'An officer reviews the new evidence, then the case continues toward a decision.',
  },
  noid: {
    stage: 'review',
    signal: 'notice',
    what: 'Community sources link this code to a Notice of Intent to Deny (NOID).',
    why: 'USCIS sends a NOID when the record so far does not support approval and you may still respond.',
    purpose:
      'It gives you a chance to respond before a final decision. The notice states the deadline.',
    next: 'Respond by the deadline on the notice. Consider talking to an immigration attorney.',
  },
  denied: {
    stage: 'decision',
    signal: 'notice',
    what: 'Community sources link this code to USCIS denying the case.',
    why: 'An officer decided the case could not be approved and recorded the decision.',
    purpose: 'It records the decision on the filing. USCIS usually mails a notice with the reason.',
    next: 'The denial notice explains the reason and any motion or appeal options and deadlines.',
  },
  closed: {
    stage: 'decision',
    signal: 'notice',
    what: 'Community sources link this code to the case record being closed.',
    why: 'USCIS closes a record when its work on that filing ends. The reason is not in the case data.',
    purpose:
      'It marks the filing as no longer pending. USCIS often sends a written notice about it.',
    next: 'Check your notices and your USCIS account for the outcome. Contact USCIS if the closure is unexpected.',
  },
  unknown: {
    stage: 'review',
    signal: 'silent',
    what: 'USCIS recorded an event that this dictionary does not describe.',
    why: 'USCIS logs many internal steps. Unrecognized events are often background activity with no notice.',
    purpose: 'The case data does not say what this event is for, and Waymark does not guess.',
    next: 'Check your notices and your USCIS account. If nothing else changed, it may be routine.',
  },
};

function variantOf(info: EventInfo): Variant {
  switch (info.category) {
    case 'receipt':
      return 'receipt';
    case 'checks':
      return info.status === 'biometrics' ? 'biometrics' : 'background';
    case 'interview':
      return info.status === 'interview' ? 'interview' : 'interview_update';
    case 'processing':
      return info.status === 'transferred' ? 'transferred' : 'processing';
    case 'hold':
      return 'hold';
    case 'approved':
      return 'approved';
    case 'card':
      return info.status === 'card_mailed'
        ? 'card_mailed'
        : info.status === 'delivered'
          ? 'card_delivered'
          : 'card_prod';
    case 'evidence':
      return info.status === 'rfe_resp' ? 'rfe_resp' : info.status === 'noid' ? 'noid' : 'rfe';
    case 'denied':
      return 'denied';
    case 'closed':
      return 'closed';
    default:
      return 'unknown';
  }
}

/** True for events from the official Case Status API (codes starting with "CS:"). */
export function isOfficialEvent(info: EventInfo): boolean {
  return info.code.toUpperCase().startsWith(OFFICIAL_CODE_PREFIX);
}

/**
 * Explain an event in general terms. Official API events take their meaning and next step from the
 * status text in statuses.ts. Unrecognized events get honest generic text and never a guessed
 * meaning. The stage of an unrecognized event is a placeholder: journey code ignores it.
 */
export function explainEvent(info: EventInfo): EventExplanation {
  const copy = COPY[variantOf(info)];
  const official = isOfficialEvent(info);
  const tone: Tone = info.status ? STATUSES[info.status].tone : 'progress';
  if (!official) {
    return {
      stage: copy.stage,
      signal: copy.signal,
      tone,
      what: copy.what,
      why: copy.why,
      purpose: copy.purpose,
      next: copy.next,
      official,
    };
  }
  // The API lists statuses that USCIS shows, so every official event is a visible status change.
  const status = info.status ? STATUSES[info.status] : undefined;
  return {
    stage: copy.stage,
    signal: 'notice',
    tone,
    what: status ? status.meaning : 'USCIS reported a status that Waymark does not classify.',
    why: info.status
      ? copy.why
      : 'The official Case Status API lists the status text USCIS shows for the case.',
    purpose: info.status
      ? copy.purpose
      : 'The wording is from USCIS. Waymark does not add a meaning to it.',
    next: status
      ? status.next
      : 'Read the status text and your notices. Check your USCIS account for anything you need to do.',
    official,
  };
}

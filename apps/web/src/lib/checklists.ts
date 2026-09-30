// Document checklists. A starting point only: the form instructions on uscis.gov are the
// authority. Item ids are stable because checked state is stored by id.

export interface Checklist {
  id: string;
  form: string;
  items: { id: string; text: string }[];
}

const list = (id: string, form: string, items: [string, string][]): Checklist => ({
  id,
  form,
  items: items.map(([itemId, text]) => ({ id: itemId, text })),
});

export const CHECKLISTS: Checklist[] = [
  list('i485', 'I-485', [
    ['form', 'Form I-485, completed and signed'],
    ['photos', 'Two passport-style photos'],
    ['id', 'Copy of government-issued photo ID'],
    ['birth', 'Birth certificate, with a certified English translation if needed'],
    ['passport', 'Passport pages with visas and entry stamps'],
    ['i94', 'Form I-94 arrival and departure record'],
    ['entry', 'Evidence of lawful entry and current status'],
    ['basis', 'Receipt or approval notice (I-797) for the underlying petition'],
    ['i693', 'Form I-693 medical exam, if required at filing'],
    ['i864', 'Form I-864 affidavit of support, if required'],
    ['records', 'Police and court records for any arrests or charges'],
    ['fee', 'Filing fee payment, amount from the G-1055 fee schedule'],
  ]),
  list('i765', 'I-765', [
    ['form', 'Form I-765, completed and signed'],
    ['photos', 'Two passport-style photos'],
    ['ead', 'Copy of prior work permit, front and back, if any'],
    ['id', 'Copy of government-issued photo ID'],
    ['i94', 'Form I-94 arrival and departure record'],
    ['category', 'Evidence of your eligibility category, for example a pending I-485 receipt'],
    ['fee', 'Filing fee payment if your category requires one, from the G-1055 fee schedule'],
  ]),
  list('i131', 'I-131', [
    ['form', 'Form I-131, completed and signed'],
    ['photos', 'Two passport-style photos, if your document type requires them'],
    ['id', 'Copy of government-issued photo ID'],
    ['status', 'Evidence of status or a pending application, for example an I-485 receipt'],
    ['purpose', 'Explanation of the purpose of travel, if your document type requires it'],
    ['fee', 'Filing fee payment, amount from the G-1055 fee schedule'],
  ]),
  list('i130', 'I-130', [
    ['form', 'Form I-130, completed and signed'],
    ['i130a', 'Form I-130A for a spouse beneficiary'],
    ['status', "Proof of the petitioner's citizenship or permanent residence"],
    ['relationship', 'Proof of the relationship, such as a marriage or birth certificate'],
    ['bona-fide', 'Evidence the marriage is genuine, if petitioning for a spouse'],
    ['names', 'Proof of any legal name changes'],
    ['photos', 'Passport-style photos of petitioner and spouse, if petitioning for a spouse'],
    ['fee', 'Filing fee payment, amount from the G-1055 fee schedule'],
  ]),
  list('n400', 'N-400', [
    ['form', 'Form N-400, completed and signed'],
    ['card', 'Copy of your green card, front and back'],
    ['marriage', 'Marriage certificate and spouse citizenship proof, if applying through marriage'],
    ['records', 'Court records for any arrests, charges, or citations'],
    ['taxes', 'Tax transcripts for recent years, if relevant to your case'],
    ['selective', 'Selective Service registration proof, if it applies to you'],
    ['trips', 'List of trips outside the United States with dates'],
    ['fee', 'Filing fee payment, amount from the G-1055 fee schedule'],
  ]),
  list('i90', 'I-90', [
    ['form', 'Form I-90, completed and signed'],
    ['card', 'Copy of your current or expired green card'],
    ['id', 'Copy of government-issued photo ID, if the card was lost or stolen'],
    ['name', 'Evidence of a legal name change, if applicable'],
    ['fee', 'Filing fee payment, amount from the G-1055 fee schedule'],
  ]),
  list('i751', 'I-751', [
    ['form', 'Form I-751, signed by both spouses when filing jointly'],
    ['card', 'Copy of your green card, front and back'],
    ['joint', 'Evidence of a shared life: lease or deed, joint bank accounts, joint tax returns'],
    ['children', 'Birth certificates of children born to the marriage, if any'],
    ['affidavits', 'Affidavits from people who know the marriage, optional'],
    ['records', 'Court records for any arrests or charges'],
    ['fee', 'Filing fee payment, amount from the G-1055 fee schedule'],
  ]),
];

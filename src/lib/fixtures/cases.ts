import type { FixtureCase } from '@/lib/fixtures/replay';

/**
 * The Mode F demo corpus (item **F-09**).
 *
 * These are **authored synthetic** documents, not recordings of real calls: no session has
 * crossed the network yet (blocker B-05), so calling them "recorded" would claim a pipeline
 * was exercised when it was not. Every document here states in its own text that it is
 * synthetic, and `tests/unit/fixtures.test.ts` enforces that — a fixture that could be
 * mistaken for a real person's bill cannot enter the set.
 *
 * Two of the three are deliberately imperfect, because a demo that only shows the easy case
 * teaches the reviewer nothing about the product:
 *  - Riverside carries one fact whose `sourceQuote` is a *rephrasing*. Grounding must flag it
 *    `quoteFound: false` and the UI must show it flagged (AGENTS.md §4 rule 8). That is the
 *    realistic model failure mode, authored in on purpose.
 *  - Meadow Walk is a medication letter, so the safety notices (P-07) have something to fire
 *    on in a demo with no real prescription in it.
 *
 * Every other quote is a literal excerpt, checked by the test that runs the real pipeline
 * against the real replay client.
 */

const NORTHGATE_TEXT = `NORTHGATE CARE NHS TRUST
Invoice NC-2026-0441
Date of issue: 2 February 2026
Amount due: £840
Payment deadline: 14 March 2026
Our bank: Riverside Building Society, sort code 00-00-00, account 12345678
If you cannot pay by the deadline, telephone 0300 123 0000 and ask for the payments team.

This letter is synthetic demo data written for Sightline. It describes no real person,
provider, account or debt.`;

const RIVERSIDE_TEXT = `RIVERSIDE BUILDING SOCIETY
Statement for account 12345678
Closing balance: £1,204.55 in credit
Direct debit: Grid Energy, £62.10 on 5 March 2026
Overdraft fee: £0.00 this month
Call 0345 000 1111 if you do not recognise a payment.

This letter is synthetic demo data written for Sightline. No real bank, account or
balance appears in it.`;

const MEADOW_TEXT = `MEADOW WALK GP SURGERY
Letter about your medicine
Medicine: sertraline 50 mg tablets
Dose: take one tablet every morning
Side effects to watch: feeling sick, trouble sleeping
Clinic: Tuesday 17 March 2026 at 10:15, Room 4
If you feel worse or have thoughts of harming yourself, call 111 now.

This letter is synthetic demo data written for Sightline. It is not medical advice and
describes no real patient or practice.`;

export const FIXTURE_CASES: FixtureCase[] = [
  {
    name: 'northgate-bill',
    title: 'Demo document 1: a care trust bill',
    text: NORTHGATE_TEXT,
    analysis: {
      docType: 'bill',
      sender: 'Northgate Care NHS Trust',
      summary:
        'A care trust invoice for 840 pounds, issued 2 February 2026, with a payment deadline of 14 March 2026 and a phone number to call if it cannot be paid by then.',
      facts: [
        { kind: 'reference', label: 'Invoice number', value: 'NC-2026-0441', sourceQuote: 'Invoice NC-2026-0441' },
        { kind: 'amount', label: 'Amount due', value: '£840', sourceQuote: 'Amount due: £840' },
        { kind: 'date', label: 'Payment deadline', value: '14 March 2026', sourceQuote: 'Payment deadline: 14 March 2026' },
        { kind: 'phone', label: 'Payments team', value: '0300 123 0000', sourceQuote: 'telephone 0300 123 0000' },
      ],
      actions: [
        {
          text: 'Pay 840 pounds by 14 March 2026',
          deadline: '14 March 2026',
          sourceQuote: 'Payment deadline: 14 March 2026',
        },
      ],
      warnings: [{ kind: 'financial', text: 'This letter asks for money by a stated date.' }],
    },
  },
  {
    name: 'riverside-statement',
    title: 'Demo document 2: a bank statement letter',
    text: RIVERSIDE_TEXT,
    analysis: {
      docType: 'bank',
      sender: 'Riverside Building Society',
      summary:
        'A bank statement showing a closing balance in credit, one direct debit due on 5 March 2026, and no overdraft fee this month.',
      facts: [
        {
          kind: 'amount',
          label: 'Closing balance',
          value: '£1,204.55 in credit',
          sourceQuote: 'Closing balance: £1,204.55 in credit',
        },
        {
          kind: 'amount',
          label: 'Balance',
          value: '£1,204.55',
          // Authored misquote: the transcript reads "Closing balance: £1,204.55 in credit".
          // This is the near-miss a real model produces, kept in the demo so the flagged
          // state is shown rather than described. It must arrive `quoteFound: false`.
          sourceQuote: 'Closing balance is £1,204.55',
        },
        { kind: 'date', label: 'Direct debit', value: '5 March 2026', sourceQuote: '£62.10 on 5 March 2026' },
        { kind: 'phone', label: 'Fraud line', value: '0345 000 1111', sourceQuote: 'Call 0345 000 1111' },
      ],
      actions: [
        {
          text: 'Ring the bank if a payment is unfamiliar',
          sourceQuote: 'Call 0345 000 1111 if you do not recognise a payment.',
        },
      ],
      warnings: [{ kind: 'financial', text: 'A direct debit of 62 pounds 10 pence leaves the account on 5 March 2026.' }],
    },
  },
  {
    name: 'meadow-walk-letter',
    title: 'Demo document 3: a GP letter about a medicine',
    text: MEADOW_TEXT,
    analysis: {
      docType: 'medical',
      sender: 'Meadow Walk GP Surgery',
      summary:
        'A GP letter about sertraline 50 mg tablets, how to take them, two side effects to watch for, and a clinic appointment on Tuesday 17 March 2026 at 10:15 in Room 4.',
      facts: [
        { kind: 'medication', label: 'Medicine', value: 'sertraline 50 mg tablets', sourceQuote: 'Medicine: sertraline 50 mg tablets' },
        { kind: 'dose', label: 'Dose', value: 'one tablet every morning', sourceQuote: 'Dose: take one tablet every morning' },
        {
          kind: 'date',
          label: 'Clinic appointment',
          value: 'Tuesday 17 March 2026 at 10:15',
          sourceQuote: 'Clinic: Tuesday 17 March 2026 at 10:15, Room 4',
        },
      ],
      actions: [
        {
          text: 'Go to the clinic appointment in Room 4',
          deadline: 'Tuesday 17 March 2026 at 10:15',
          sourceQuote: 'Tuesday 17 March 2026 at 10:15, Room 4',
        },
        {
          text: 'Call 111 now if you feel worse or have thoughts of harming yourself',
          sourceQuote: 'If you feel worse or have thoughts of harming yourself, call 111 now.',
        },
      ],
      warnings: [
        { kind: 'medical', text: 'This letter describes a medicine and a dose. Confirm any change with the surgery.' },
        { kind: 'urgency', text: 'The letter gives a number to call straight away if things get worse.' },
      ],
    },
  },
];

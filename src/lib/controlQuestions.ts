import type { ControlQuestion } from "./types";

/**
 * The 20-question control set for the gbrain retrieval eval ("Garry scoring").
 *
 *   navigation (6) -> Hit@1 / Hit@3   "point me to the page that answers this"
 *   evidence   (9) -> cite / rule     "explain it, cite the source, state the rule"
 *   decode     (5) -> cite / rule     "diagnose the symptom, name the rule/code"
 *
 * A question passes when a navigation answer lands at rank 1, or when an
 * evidence/decode answer gets BOTH cite and rule right. The headline score is
 * the count of passing questions out of 20 — the target is 20/20.
 */
export const CONTROL_QUESTIONS: ControlQuestion[] = [
  // --- navigation ---
  { id: 1, category: "navigation", question: "Where is the monthly billing invoice generation job defined?" },
  { id: 2, category: "navigation", question: "Which command deploys RetellAI voice prompts and what are its options?" },
  { id: 3, category: "navigation", question: "Where is the dispute auto reverse-transfer logic implemented?" },
  { id: 4, category: "navigation", question: "Which tool updates S3 env vars and what is the mandatory workflow?" },
  { id: 5, category: "navigation", question: "Where are sequence terminal statuses defined?" },
  { id: 6, category: "navigation", question: "Which job sends the daily payout report and which date field does it filter on?" },

  // --- evidence ---
  { id: 7, category: "evidence", question: "How are recovery dynamic fees calculated and what is the rate basis?" },
  { id: 8, category: "evidence", question: "How is the dispute fee gated per payment and when is it billed?" },
  { id: 9, category: "evidence", question: "How does the idempotency guard prevent duplicate invoices and how is it bypassed?" },
  { id: 10, category: "evidence", question: "Which sequence statuses must never receive notifications and why?" },
  { id: 11, category: "evidence", question: "How are Stripe payouts created and when does the payout reference become available?" },
  { id: 12, category: "evidence", question: "Why did the Stripe webhook start failing for Connected Account events?" },
  { id: 13, category: "evidence", question: "How does contact enrichment cross-reference and score additional contacts?" },
  { id: 14, category: "evidence", question: "What is the reverse_transfer revenue-loss bug and its financial scale?" },
  { id: 15, category: "evidence", question: "How does the auto-dispute-recovery config gate the Stripe-side fee charge?" },

  // --- decode ---
  { id: 16, category: "decode", question: "Payout Reference shows \"Pending\" on every row of the daily payout report — which rule caused it, and was the fix correct?" },
  { id: 17, category: "decode", question: "A creditor was billed the $22 dispute fee twice — which two code paths collide, and how is it prevented?" },
  { id: 18, category: "decode", question: "A closed (recovered) sequence still received a notification — which guard was missing?" },
  { id: 19, category: "decode", question: "Google login fails in prod since June 11 — which env-var rule caused it, and what was the correct fix?" },
  { id: 20, category: "decode", question: "The invoice-upload button is reported \"broken\" for creditors — is this a real outage or a config probe false alarm, and which config key is involved?" },
];

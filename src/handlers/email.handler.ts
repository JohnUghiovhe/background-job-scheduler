export interface EmailPayload {
  to: string;
  subject: string;
  body?: string;
}

/**
 * Simulates email delivery with real validation and latency.
 * ~10% failure rate to exercise retry/DLQ paths.
 */
export async function handleSendEmail(payload: Record<string, unknown>): Promise<void> {
  const { to, subject, body } = payload as unknown as EmailPayload;

  if (!to || typeof to !== 'string' || !to.includes('@')) {
    throw new Error(`Invalid email recipient: ${to}`);
  }
  if (!subject || typeof subject !== 'string') {
    throw new Error('Email subject is required');
  }

  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));

  if (Math.random() < 0.1) {
    throw new Error(`SMTP transient failure delivering to ${to}`);
  }

  const message = body || `Subject: ${subject}`;
  if (message.length > 10000) {
    throw new Error('Email body exceeds size limit');
  }
}

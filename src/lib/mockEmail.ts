/**
 * Placeholder email service. In production this would call a real
 * provider (Postmark/SendGrid/etc). For now it just logs, which is enough
 * to demo and test the reminder/notification triggers end to end.
 */
export function sendMockEmail(to: string, subject: string, body: string) {
  console.log(`\n📧 [mock email] To: ${to}\nSubject: ${subject}\n${body}\n`);
}

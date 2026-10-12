/**
 * Placeholder email service. In production this would call a real
 * provider (Postmark/SendGrid/etc). For now it just logs, which is enough
 * to demo and test the reminder/notification triggers end to end.
 *
 * Links are stripped before logging: some emails carry private links (a parent's
 * consent-signing link, or the never-expiring link to withdraw consent), and server
 * logs are readable by anyone with access to the hosting dashboard. Those links reach
 * people another way: admins copy consent links from the admin page, and the parent
 * sees the withdraw link on the confirmation page after signing.
 */
const LINK = /https?:\/\/\S+/g;

export function sendMockEmail(to: string, subject: string, body: string) {
  const loggedBody = body.replace(LINK, "[link withheld from logs]");
  console.log(`\n📧 [mock email] To: ${to}\nSubject: ${subject}\n${loggedBody}\n`);
}

/**
 * Mock video call link. In production this would call a real provider
 * (Zoom/Daily/Twilio). We generate a stable, fake room URL per booking so
 * the "first session" video-call feature is demoable end to end.
 */
export function generateMockVideoCallUrl(bookingId: string): string {
  return `https://meet.coachconnect.dev/room/${bookingId}`;
}

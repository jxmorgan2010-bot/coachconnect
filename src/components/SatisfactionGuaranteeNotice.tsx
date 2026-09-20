import DisputeButton from "@/app/dashboard/DisputeButton";

/**
 * Ties into the existing dispute/admin system (Dispute.reason already has DISSATISFIED,
 * resolved the same way as any other case at /admin/disputes) rather than a second,
 * separate support pathway.
 */
export default function SatisfactionGuaranteeNotice({ bookingId }: { bookingId: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-muted p-3">
      <p className="text-sm font-bold text-ink">Not satisfied with this session?</p>
      <p className="text-xs text-muted-foreground">
        Contact support for a resolution — we&apos;ll look into it and make it right.
      </p>
      <DisputeButton bookingId={bookingId} />
    </div>
  );
}

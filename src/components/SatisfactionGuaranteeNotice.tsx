import DisputeButton from "@/app/dashboard/DisputeButton";

/**
 * Ties into the existing dispute/admin system (Dispute.reason already has DISSATISFIED,
 * resolved the same way as any other case at /admin/disputes) rather than a second,
 * separate support pathway. Copy matches what an admin can actually do: review and refund.
 */
export default function SatisfactionGuaranteeNotice({ bookingId }: { bookingId: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-line bg-chalk p-3">
      <p className="text-sm font-bold text-ink">Something wrong with this session?</p>
      <p className="text-xs text-muted-foreground">
        Open a case and an admin will review it. They can issue a refund if it&apos;s warranted.
      </p>
      <DisputeButton bookingId={bookingId} />
    </div>
  );
}

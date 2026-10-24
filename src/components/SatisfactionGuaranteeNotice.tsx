import DisputeButton from "@/app/dashboard/DisputeButton";

/**
 * Ties into the existing dispute/admin system (Dispute.reason already has DISSATISFIED,
 * resolved the same way as any other case at /admin/disputes) rather than a second,
 * separate support pathway. Copy matches what an admin can actually do: review and refund.
 *
 * `lateCancel` is the same channel for a late-cancelled session: asking an admin to waive
 * the charge (emergencies, weather).
 */
export default function SatisfactionGuaranteeNotice({ bookingId, lateCancel = false }: { bookingId: string; lateCancel?: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-line bg-chalk p-3">
      <p className="text-sm font-bold text-ink">{lateCancel ? "Had an emergency?" : "Something wrong with this session?"}</p>
      <p className="text-xs text-muted-foreground">
        {lateCancel
          ? "Tell us what happened and an admin will review it. They can waive the charge for emergencies or weather."
          : "Open a case and an admin will review it. They can issue a refund if it's warranted."}
      </p>
      {lateCancel ? (
        <DisputeButton bookingId={bookingId} presetReason="OTHER" buttonLabel="Ask to waive the charge" />
      ) : (
        <DisputeButton bookingId={bookingId} />
      )}
    </div>
  );
}

import Badge from "@/components/Badge";

export default function MinorBackgroundNotice({ verified }: { verified: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Standard automated background checks may not apply to coaches under 18. Our team will follow up separately
        to confirm and record whatever verification applies to your account — this step is handled manually for
        now, not automatically like the standard flow.
      </p>
      <Badge variant={verified ? "success" : "warning"}>
        {verified ? "Verification confirmed by our team" : "Awaiting manual verification"}
      </Badge>
    </div>
  );
}

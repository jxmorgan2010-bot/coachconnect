type Recommendation = { id: string; content: string | null; recommenderName: string | null; recommenderRole: string | null };

/** Submitted coach recommendations, as quotes. */
export default function RecommendationsList({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <div className="flex flex-col gap-4">
      {recommendations.map((rec) => (
        <blockquote key={rec.id} className="border-l-4 border-gold bg-muted py-3 pl-4 pr-3">
          <p className="text-ink">&ldquo;{rec.content}&rdquo;</p>
          <footer className="mt-2 text-xs font-bold text-muted-foreground">
            {rec.recommenderName}
            {rec.recommenderRole ? ` · ${rec.recommenderRole}` : ""}
          </footer>
        </blockquote>
      ))}
    </div>
  );
}

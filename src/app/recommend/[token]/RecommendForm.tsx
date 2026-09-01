"use client";

import { useState } from "react";
import { inputClass, labelClass, primaryButtonClass, errorClass, successClass } from "@/lib/ui";

export default function RecommendForm({
  token,
  coachName,
  alreadySubmitted,
}: {
  token: string;
  coachName: string;
  alreadySubmitted: boolean;
}) {
  const [recommenderName, setRecommenderName] = useState("");
  const [recommenderRole, setRecommenderRole] = useState("");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (submitted) {
    return <p className={successClass}>Thanks! Your recommendation for {coachName} has been submitted.</p>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/recommendation/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommenderName, recommenderRole, content }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <p className={errorClass}>{error}</p>}
      <div>
        <label className={labelClass} htmlFor="recommenderName">Your name</label>
        <input id="recommenderName" className={inputClass} value={recommenderName} onChange={(e) => setRecommenderName(e.target.value)} required />
      </div>
      <div>
        <label className={labelClass} htmlFor="recommenderRole">Your role</label>
        <input
          id="recommenderRole"
          placeholder="e.g. Varsity Basketball Coach, Springfield High"
          className={inputClass}
          value={recommenderRole}
          onChange={(e) => setRecommenderRole(e.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="content">Your recommendation</label>
        <textarea
          id="content"
          rows={5}
          className={inputClass}
          placeholder={`What makes ${coachName} a great coach for young athletes?`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          minLength={20}
        />
      </div>
      <button type="submit" className={primaryButtonClass} disabled={loading}>
        {loading ? "Submitting..." : "Submit recommendation"}
      </button>
    </form>
  );
}

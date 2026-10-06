import type { ReactNode } from "react";
import AdminNav from "@/app/admin/AdminNav";

/** Shared top of every admin page: eyebrow, page title, one-line purpose, tabs. */
export default function AdminHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <p className="eyebrow mb-2 text-pitch">Admin</p>
      <h1 className="text-display-lg font-display text-ink">{title}</h1>
      <p className="mt-2 mb-6 max-w-3xl text-muted-foreground">{children}</p>
      <AdminNav />
    </>
  );
}

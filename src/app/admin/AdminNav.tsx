import TabNav from "@/components/TabNav";

const TABS = [
  { href: "/admin", label: "Verifications" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminNav() {
  return <TabNav label="Admin" tabs={TABS} />;
}

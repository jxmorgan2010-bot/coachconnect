import TabNav from "@/components/TabNav";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/family", label: "Family" },
  { href: "/dashboard/points", label: "Points" },
];

export default function ParentTabs() {
  return <TabNav label="Parent dashboard" tabs={TABS} />;
}

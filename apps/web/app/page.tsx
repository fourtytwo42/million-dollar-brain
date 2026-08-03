import { BrainDashboard } from "@/components/brain-dashboard";
import { snapshotStatusResponse } from "@/lib/dex-nav-snapshot";

export const dynamic = "force-dynamic";

export default function Page() {
  return <BrainDashboard initialData={snapshotStatusResponse() as never} />;
}

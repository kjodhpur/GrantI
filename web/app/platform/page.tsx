import type { Metadata } from "next";
import PlatformWorkspace from "./platform-workspace";

export const metadata: Metadata = {
  title: "Prospect workspace — GPI",
  description: "GPI workspace: private foundations ranked from IRS 990-PF filings against your organization profile, with pipeline tracking and human review.",
};

export default function PlatformPage() {
  return <PlatformWorkspace />;
}

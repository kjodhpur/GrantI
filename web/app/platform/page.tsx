import type { Metadata } from "next";
import PlatformWorkspace from "./platform-workspace";

export const metadata: Metadata = {
  title: "Prospect workspace — GPI",
  description: "Interactive GPI demo workspace with fictional prospects, match scoring, pipeline tracking, and human-led review.",
};

export default function PlatformPage() {
  return <PlatformWorkspace />;
}

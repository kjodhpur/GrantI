import { notFound } from "next/navigation";
import { getProspect } from "@/lib/api";
import ProspectDetail from "./prospect-detail";

export default async function ProspectPage({ params }: PageProps<"/prospects/[id]">) {
  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) notFound();
  return <ProspectDetail prospect={prospect} />;
}
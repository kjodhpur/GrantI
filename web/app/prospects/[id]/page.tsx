import { notFound } from "next/navigation";
import { getFoundation } from "@/lib/match";
import ProspectDetail from "./prospect-detail";

export const dynamic = "force-dynamic";

export default async function ProspectPage({ params }: PageProps<"/prospects/[id]">) {
  const { id } = await params;
  if (!/^\d{9}$/.test(id)) notFound();
  const foundation = await getFoundation(id);
  if (!foundation) notFound();
  return <ProspectDetail foundation={foundation} />;
}

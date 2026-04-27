import ElectroBoard from "@/components/ElectroBoard";

export default function ProjectPage({
  params,
}: {
  params: { id: string };
}) {
  return <ElectroBoard projectId={params.id} />;
}

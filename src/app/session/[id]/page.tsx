import { WorkshopView } from '@/components/workshop';
export default async function Session({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkshopView id={id} />;
}

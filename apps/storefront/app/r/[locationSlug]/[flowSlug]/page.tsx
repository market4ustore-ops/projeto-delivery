import { PublicFlow } from './public-flow';
export default async function PublicFlowPage({
  params,
}: {
  params: Promise<{ locationSlug: string; flowSlug: string }>;
}) {
  return <PublicFlow {...await params} />;
}

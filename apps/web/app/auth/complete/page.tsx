import { CompleteAuth } from '../../../components/CompleteAuth';

export default async function CompleteAuthPage({ searchParams }: { searchParams: Promise<{ code?: string; type?: string }> }) {
  const params = await searchParams;
  return <CompleteAuth code={params.code} type={params.type} />;
}

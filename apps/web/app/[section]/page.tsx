import { notFound } from 'next/navigation';
import { AuthenticatedApp } from '../../components/AuthenticatedApp';

const sections = new Set(['review', 'library', 'collections', 'settings']);

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <AuthenticatedApp section={section} />;
}

import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AuthenticatedApp } from '../../components/AuthenticatedApp';
import { getChromeExtensionId } from '../../lib/extensionRecommendation';

const sections = new Set(['review', 'library', 'collections', 'settings']);

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  await connection();
  return <AuthenticatedApp extensionId={getChromeExtensionId(process.env.CHROME_EXTENSION_ID)} section={section} />;
}

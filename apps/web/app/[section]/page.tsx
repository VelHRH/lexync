import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AuthenticatedApp } from '../../components/AuthenticatedApp';
import { getChromeExtensionId } from '../../lib/extensionRecommendation';
import { readNavigationCollapsed } from '../../lib/navigationPreference';

const sections = new Set(['materials', 'library', 'collections', 'profile', 'settings']);

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  await connection();
  return <AuthenticatedApp navigationCollapsed={await readNavigationCollapsed()} extensionId={getChromeExtensionId(process.env.CHROME_EXTENSION_ID)} section={section} />;
}

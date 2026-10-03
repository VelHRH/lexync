import { connection } from 'next/server';
import { AuthenticatedApp } from '../../../components/AuthenticatedApp';
import { getChromeExtensionId } from '../../../lib/extensionRecommendation';
import { readNavigationCollapsed } from '../../../lib/navigationPreference';

export default async function LessonHistoryPage() {
  await connection();
  return <AuthenticatedApp navigationCollapsed={await readNavigationCollapsed()} extensionId={getChromeExtensionId(process.env.CHROME_EXTENSION_ID)} section="history" />;
}

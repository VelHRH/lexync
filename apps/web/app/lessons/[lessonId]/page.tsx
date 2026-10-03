import { LessonRunner } from '../../../components/LessonRunner';

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <LessonRunner lessonId={lessonId} />;
}

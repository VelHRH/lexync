import { AuthForm } from '../../../components/AuthForm';

const onboardingDestinations = new Set(['/onboarding/learning-language', '/onboarding/study-pair']);

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = next && onboardingDestinations.has(next) ? next : '/';
  return <AuthForm mode="sign-in" nextPath={nextPath} />;
}

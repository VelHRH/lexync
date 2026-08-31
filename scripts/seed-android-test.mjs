import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL;
const publishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.LEXYNC_ANDROID_TEST_EMAIL ?? 'android-learner@example.test';
const password = process.env.LEXYNC_ANDROID_TEST_PASSWORD ?? 'Lexync-Android-test-37';

if (!supabaseUrl || !publishableKey) {
  throw new Error('Local Supabase configuration is unavailable.');
}

const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });
const signUp = await client.auth.signUp({ email, password });

if (signUp.error && signUp.error.code !== 'user_already_exists') {
    throw signUp.error;
}

if (!signUp.data.session) {
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    throw signIn.error;
  }
}

const existingPairs = await client.from('study_pairs').select('id,target_language_tag,reference_language_tag');
if (existingPairs.error) {
  throw existingPairs.error;
}
for (const pair of existingPairs.data) {
  const deletion = await client.rpc('delete_study_pair', {
    p_confirmation: `${pair.target_language_tag} → ${pair.reference_language_tag}`,
    p_study_pair_id: pair.id,
  });
  if (deletion.error) {
    throw deletion.error;
  }
}

const studyPair = await client.rpc('create_study_pair', {
  p_reference_language_tag: 'en',
  p_target_language_tag: 'es',
});
if (studyPair.error) {
  throw studyPair.error;
}

for (const material of [
  { translation: 'to walk', example: 'Camino al trabajo cada mañana.' },
  { translation: 'to travel on foot', example: 'Prefiero caminar cuando hace sol.' },
]) {
  const capture = await client.rpc('capture_manual_entry', {
    p_example: material.example,
    p_expression: 'caminar',
    p_study_pair_id: studyPair.data.id,
    p_translation: material.translation,
  });
  if (capture.error) {
    throw capture.error;
  }
}

await client.auth.signOut();
console.log(JSON.stringify({ email, password }));

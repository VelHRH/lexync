import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deriveRecognitionCardSchedule, type RecognitionReviewEvent } from '../packages/domain/src/index';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerLearner(prefix: string, languageTags: string[]) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const languageIds: string[] = [];
  for (const languageTag of languageTags) {
    const result = await client.rpc('create_learning_language', { p_language_tag: languageTag });
    if (result.error) throw result.error;
    languageIds.push((result.data as { id: string }).id);
  }
  return { account, client, languageIds };
}

async function captureEntry(client: SupabaseClient, learningLanguageId: string, answerLanguageTag: string, expression: string, translation: string) {
  const { data, error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: answerLanguageTag,
    p_create_new_sense: false,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
    p_translation: translation,
  });
  if (error) throw error;
  return data as { vocabularyEntryId: string };
}

async function suspendEntry(client: SupabaseClient, vocabularyEntryId: string) {
  const { data: compatibilityEntry, error: compatibilityError } = await client
    .from('vocabulary_entries')
    .select('id')
    .eq('learning_vocabulary_entry_id', vocabularyEntryId)
    .single();
  if (compatibilityError || !compatibilityEntry) throw compatibilityError ?? new Error('The compatibility Vocabulary Entry fixture is missing.');
  const { error } = await client.rpc('set_vocabulary_entry_suspended', {
    p_suspended: true,
    p_vocabulary_entry_id: compatibilityEntry.id,
  });
  if (error) throw error;
}

async function seedRecognitionChoices() {
  const { account, client, languageIds } = await registerLearner('recognition-choices', ['es', 'it']);
  const spanish = languageIds[0];
  const italian = languageIds[1];
  await captureEntry(client, spanish, 'en', 'casa', 'house');
  await captureEntry(client, spanish, 'en', 'perro', 'dog');
  await captureEntry(client, spanish, 'en', 'libro', 'book');
  await captureEntry(client, spanish, 'en', 'mesa', 'table');
  await captureEntry(client, spanish, 'en', 'can', ' DOG ');
  const suspended = await captureEntry(client, spanish, 'en', 'nube', 'cloud');
  await suspendEntry(client, suspended.vocabularyEntryId);
  await captureEntry(client, spanish, 'uk', 'fruta', 'фрукт');
  await captureEntry(client, italian, 'en', 'gatto', 'cat');
  const other = await registerLearner('recognition-choices-other', ['es']);
  await captureEntry(other.client, other.languageIds[0], 'en', 'privado', 'private');
  return { account, client };
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

type LearningReviewRow = {
  created_at: string;
  direction: 'recognition' | 'recall';
  events: RecognitionReviewEvent[];
  expression: string;
  id: string;
  learning_language_id: string;
  translations: string[];
};

async function seedRecallReview(prefix: string, expression: string, translations: string[]) {
  const { account, client, languageIds } = await registerLearner(prefix, ['es']);
  const learningLanguageId = languageIds[0];
  await captureEntry(client, learningLanguageId, 'en', expression, translations[0]);
  for (const translation of translations.slice(1)) {
    await captureEntry(client, learningLanguageId, 'en', expression, translation);
  }

  const { data, error } = await client.rpc('learning_scheduled_review_overview', {
    p_learning_language_id: learningLanguageId,
  });
  if (error) throw error;
  const rows = (data ?? []) as LearningReviewRow[];
  const recallCard = rows.find((row) => row.direction === 'recall' && row.expression === expression);
  const recognitionCard = rows.find((row) => row.direction === 'recognition' && row.expression === expression);
  if (!recallCard || !recognitionCard) throw new Error('The Recall and Recognition Card fixtures are missing.');

  const occurredAt = new Date().toISOString();
  const { error: reviewError } = await client.rpc('confirm_scheduled_review', {
    p_card_id: recognitionCard.id,
    p_event_id: crypto.randomUUID(),
    p_occurred_at: occurredAt,
    p_rating: 'good',
  });
  if (reviewError) throw reviewError;

  return { account, client, learningLanguageId, recallCard, recognitionCard };
}

async function expectNoMobileOverflow(page: Page) {
  if (test.info().project.name === 'web-scheduled-recognition-mobile') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
}

async function scheduledReviewRows(client: SupabaseClient, learningLanguageId: string) {
  const { data, error } = await client.rpc('learning_scheduled_review_overview', {
    p_learning_language_id: learningLanguageId,
  });
  if (error) throw error;
  return (data ?? []) as LearningReviewRow[];
}

function queueOrder(rows: LearningReviewRow[]) {
  return [...rows].sort((first, second) => {
    const firstDue = deriveRecognitionCardSchedule({ createdAt: first.created_at, events: first.events }).due.getTime();
    const secondDue = deriveRecognitionCardSchedule({ createdAt: second.created_at, events: second.events }).due.getTime();
    const dueDifference = firstDue - secondDue;
    if (dueDifference) return dueDifference;
    const directionDifference = (first.direction === 'recognition' ? 0 : 1) - (second.direction === 'recognition' ? 0 : 1);
    return directionDifference || first.id.localeCompare(second.id);
  });
}

async function recordFixtureReview(client: SupabaseClient, cardId: string, occurredAt: string) {
  const { error } = await client.rpc('confirm_scheduled_review', {
    p_card_id: cardId,
    p_event_id: crypto.randomUUID(),
    p_occurred_at: occurredAt,
    p_rating: 'again',
  });
  if (error) throw error;
}

async function scheduledSessionItems(client: SupabaseClient, learningLanguageId: string) {
  const { data, error } = await client.rpc('scheduled_review_session_overview', {
    p_learning_language_id: learningLanguageId,
  });
  if (error || !data || typeof data !== 'object') throw error ?? new Error('The Scheduled Review session fixture is missing.');
  const items = (data as { items?: Array<{ card_id: string; ordinal: number }> }).items ?? [];
  return [...items].sort((first, second) => first.ordinal - second.ordinal);
}

async function expectProgress(page: Page, position: number, total: number) {
  await expect(page.getByRole('status').filter({ hasText: new RegExp(`${position} of ${total}`) })).toBeVisible();
}

async function expectSessionCard(page: Page, card: LearningReviewRow) {
  await expect(page.getByRole('heading', { name: card.direction === 'recognition' ? 'Recognition' : 'Recall' })).toBeVisible();
  if (card.direction === 'recognition') {
    await expect(page.getByText(card.expression, { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(card.translations[0], { exact: true })).toBeVisible();
  }
}

async function confirmCurrentSessionCard(page: Page, expression: string, translation: string) {
  const recognition = page.getByRole('heading', { name: 'Recognition' });
  if (await recognition.isVisible()) {
    const answer = page.getByRole('radio', { name: translation, exact: true });
    if (await answer.count()) {
      await answer.check();
    } else {
      await page.getByRole('button', { name: 'Reveal translation' }).click();
    }
  } else {
    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible();
    await page.getByLabel('Target Expression').fill(expression);
    await page.getByRole('button', { name: 'Check answer' }).click();
  }
  await page.getByRole('radio', { name: 'Good', exact: true }).check();
  await page.getByRole('button', { name: 'Confirm review' }).click();
}

async function startScheduledReview(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: /Start review/i }).click();
  await expect(page).toHaveURL('/review');
  await expect(page.getByRole('heading', { name: /Recognition|Recall/ })).toBeVisible();
}

async function seedSessionFixture(prefix: string, entries: Array<[string, string]>) {
  const { account, client, languageIds } = await registerLearner(prefix, ['es', 'it']);
  const learningLanguageId = languageIds[0];
  const otherLearningLanguageId = languageIds[1];
  for (const [expression, translation] of entries) {
    await captureEntry(client, learningLanguageId, 'en', expression, translation);
  }
  await captureEntry(client, otherLearningLanguageId, 'en', 'gatto', 'cat');
  const rows = queueOrder(await scheduledReviewRows(client, learningLanguageId));
  return { account, client, learningLanguageId, otherLearningLanguageId, rows };
}

test.describe('web Scheduled Recognition', () => {
  test('shows owned due counts by Learning Language and starts only the active language', async ({ page }) => {
    const { account, client, languageIds } = await registerLearner('recognition-counts', ['es', 'it']);
    const spanish = languageIds[0];
    const italian = languageIds[1];
    await captureEntry(client, spanish, 'en', 'casa', 'house');
    await captureEntry(client, spanish, 'en', 'casa', 'home');
    const suspended = await captureEntry(client, spanish, 'en', 'nube', 'cloud');
    await suspendEntry(client, suspended.vocabularyEntryId);
    await captureEntry(client, italian, 'en', 'gatto', 'cat');
    const other = await registerLearner('recognition-other', ['es']);
    await captureEntry(other.client, other.languageIds[0], 'en', 'privado', 'private');

    await signIn(page, account);
    const counts = page.getByRole('region', { name: 'Scheduled Review due counts' });
    await expect(counts.getByText('Spanish 2 due', { exact: true })).toBeVisible();
    await expect(counts.getByText('Italian 2 due', { exact: true })).toHaveCount(0);
    await expect(page.getByText('privado', { exact: true })).toHaveCount(0);
    await page.getByLabel('Active Learning Language').selectOption(italian);
    await expect(counts.getByText('Italian 2 due', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Start review' }).click();
    await expect(page).toHaveURL('/review');
    await expect(page.getByText('gatto', { exact: true })).toBeVisible();
    await expect(page.getByText('casa', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Active Learning Language')).toBeDisabled();
    await page.getByRole('button', { name: 'End review early' }).click();
    await expect(page.getByRole('heading', { name: 'Review ended' })).toBeVisible();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByLabel('Active Learning Language').selectOption(spanish);
    await page.getByRole('link', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('árbol');
    await page.getByLabel('Answer Language').fill('en');
    const translation = page.getByLabel('Translation');
    await translation.fill('tree');
    await translation.press('Enter');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(counts.getByText('Spanish 4 due', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Start review' }).click();
    await expect(page).toHaveURL('/review');
    await expect(page.getByText('casa', { exact: true })).toBeVisible();
    await expect(page.getByText('gatto', { exact: true })).toHaveCount(0);
    await expect(page.getByText('nube', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('reveals, overrides Again, records each direction once, and restores the derived schedule', async ({ page }) => {
    const { account, client, languageIds } = await registerLearner('recognition-review', ['es']);
    await captureEntry(client, languageIds[0], 'en', 'casa', 'house');
    await signIn(page, account);
    await page.goto('/review');

    await expect(page.getByRole('heading', { name: 'Recognition' })).toBeVisible();
    await expect(page.getByText('casa', { exact: true })).toBeVisible();
    await expect(page.getByText('house', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reveal translation' }).press('Enter');
    await expect(page.getByText('house', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Again' })).toBeChecked();
    await page.getByRole('radio', { name: 'Good' }).check();
    await page.getByRole('button', { name: 'Confirm review' }).press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Review recorded' })).toContainText('Review recorded. Next review');

    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible();
    await page.getByLabel('Target Expression').fill('casa');
    await page.getByRole('button', { name: 'Check answer' }).press('Enter');
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: /correct/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Correct', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Good', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Confirm review' }).press('Enter');
    await expect(page.getByText(/No .*Cards are due for Spanish\./)).toBeVisible();

    const { data: events, error } = await client.from('review_events').select('card_id, rating');
    if (error) throw error;
    expect(events).toHaveLength(2);
    expect(events?.every((event) => event.rating === 'good')).toBeTruthy();

    await page.reload();
    await expect(page.getByText(/No .*Cards are due for Spanish\./)).toBeVisible();
    const { count, error: countError } = await client.from('review_events').select('*', { count: 'exact', head: true });
    if (countError) throw countError;
    expect(count).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('offers four credible choices, preselects Good for a correct answer, and records a keyboard override once', async ({ page }) => {
    const { account, client } = await seedRecognitionChoices();
    await signIn(page, account);
    await page.goto('/review');

    await expect(page.getByText('casa', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reveal translation' })).toHaveCount(0);
    const answerNames = ['house', 'dog', 'book', 'table'];
    const answerRadios = page.getByRole('radio');
    await expect(answerRadios).toHaveCount(4);
    for (const answerName of answerNames) {
      await expect(page.getByRole('radio', { name: answerName, exact: true })).toHaveCount(1);
    }
    await expect(page.getByText('cloud', { exact: true })).toHaveCount(0);
    await expect(page.getByText('фрукт', { exact: true })).toHaveCount(0);
    await expect(page.getByText('cat', { exact: true })).toHaveCount(0);
    await expect(page.getByText('private', { exact: true })).toHaveCount(0);

    const correctAnswer = page.getByRole('radio', { name: 'house', exact: true });
    await correctAnswer.focus();
    await correctAnswer.press('Space');
    await expect(page.getByRole('radio', { name: 'Good', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Again', exact: true }).check();
    const confirm = page.getByRole('button', { name: 'Confirm review' });
    await confirm.focus();
    await confirm.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Review recorded' })).toContainText('Review recorded. Next review');

    const { data: events, error } = await client.from('review_events').select('rating');
    if (error) throw error;
    expect(events).toHaveLength(1);
    expect(events?.[0].rating).toBe('again');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('preselects Again for an incorrect choice and allows a rating override', async ({ page }) => {
    const { account, client } = await seedRecognitionChoices();
    await signIn(page, account);
    await page.goto('/review');

    await page.getByRole('radio', { name: 'dog', exact: true }).check();
    await expect(page.getByRole('radio', { name: 'Again', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Hard', exact: true }).check();
    await page.getByRole('button', { name: 'Confirm review' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Review recorded' })).toContainText('Review recorded. Next review');

    const { data: events, error } = await client.from('review_events').select('rating');
    if (error) throw error;
    expect(events).toHaveLength(1);
    expect(events?.[0].rating).toBe('hard');
  });

  test('runs a typed Recall review by keyboard, shows all translations, and records only the Recall event', async ({ page }) => {
    const { account, client, recallCard, recognitionCard } = await seedRecallReview('recall-keyboard', 'casa', ['house', 'home']);
    await signIn(page, account);
    await page.goto('/review');

    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible();
    await expect(page.getByText('Answer Language: en. Type the Target Expression.', { exact: true })).toBeVisible();
    await expect(page.getByText('house', { exact: true })).toBeVisible();
    await expect(page.getByText('home', { exact: true })).toBeVisible();
    const input = page.getByLabel('Target Expression');
    await input.fill('  CASA!  ');
    const check = page.getByRole('button', { name: 'Check answer' });
    await check.focus();
    await check.press('Enter');
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: /correct/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Correct', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Incorrect', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Good', exact: true })).toBeChecked();

    await page.getByRole('radio', { name: 'Incorrect', exact: true }).check();
    await expect(page.getByRole('radio', { name: 'Again', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Easy', exact: true }).check();
    const confirm = page.getByRole('button', { name: 'Confirm review' });
    await confirm.focus();
    await confirm.press('Enter');
    await expect(page.getByRole('heading', { name: 'Review complete' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /complete/i })).toContainText('1 of 1');

    const { data: events, error } = await client.from('review_events').select('card_id, rating').in('card_id', [recallCard.id, recognitionCard.id]);
    if (error) throw error;
    expect(events).toHaveLength(2);
    expect(events?.filter((event) => event.card_id === recognitionCard.id)).toHaveLength(1);
    expect(events?.find((event) => event.card_id === recallCard.id)?.rating).toBe('easy');
    const { count, error: recallEventError } = await client.from('review_events').select('*', { count: 'exact', head: true }).eq('card_id', recallCard.id);
    if (recallEventError) throw recallEventError;
    expect(count).toBe(1);
    await expectNoMobileOverflow(page);
  });

  test('shows Again for an incorrect typed Recall answer and allows correctness and rating overrides', async ({ page }) => {
    const { account, client, recallCard, recognitionCard } = await seedRecallReview('recall-override', "l'amour", ['love', 'affection']);
    await signIn(page, account);
    await page.goto('/review');

    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible();
    await page.getByLabel('Target Expression').fill('lamour');
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: /incorrect/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Incorrect', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Again', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Correct', exact: true }).check();
    await expect(page.getByRole('radio', { name: 'Good', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Hard', exact: true }).check();
    await page.getByRole('button', { name: 'Confirm review' }).click();
    await expect(page.getByRole('heading', { name: 'Review complete' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /complete/i })).toContainText('1 of 1');

    const { data: events, error } = await client.from('review_events').select('card_id, rating').in('card_id', [recallCard.id, recognitionCard.id]);
    if (error) throw error;
    expect(events).toHaveLength(2);
    expect(events?.find((event) => event.card_id === recallCard.id)?.rating).toBe('hard');
    expect(events?.find((event) => event.card_id === recognitionCard.id)?.rating).toBe('good');
    await expectNoMobileOverflow(page);
  });

  test('starts one stable Learning Language queue with accessible progress and no cross-language Cards', async ({ page }) => {
    const fixture = await seedSessionFixture('scheduled-session-start', [['casa', 'house'], ['perro', 'dog']]);
    await signIn(page, fixture.account);
    await startScheduledReview(page);

    const firstCard = fixture.rows[0];
    await expect(page.getByRole('heading', { name: firstCard.direction === 'recognition' ? 'Recognition' : 'Recall' })).toBeVisible();
    await expectSessionCard(page, firstCard);
    await expect(page.getByText('gatto', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Active Learning Language')).toHaveValue(fixture.learningLanguageId);
    await expectProgress(page, 1, fixture.rows.length);
    await expectNoMobileOverflow(page);
  });

  test('keeps the Spanish session context when another tab switches the active Learning Language', async ({ page }) => {
    const fixture = await seedSessionFixture('scheduled-session-language-tab', [['casa', 'house'], ['perro', 'dog']]);
    await signIn(page, fixture.account);
    await startScheduledReview(page);
    const firstCard = fixture.rows[0];
    const secondCard = fixture.rows[1];
    await expectSessionCard(page, firstCard);
    await expectProgress(page, 1, fixture.rows.length);

    const secondPage = await page.context().newPage();
    try {
      await secondPage.goto('/');
      await expect(secondPage.getByLabel('Active Learning Language')).toHaveValue(fixture.learningLanguageId);
      await secondPage.getByLabel('Active Learning Language').selectOption(fixture.otherLearningLanguageId);
      await expect(secondPage.getByLabel('Active Learning Language')).toHaveValue(fixture.otherLearningLanguageId);
      await expect(page.getByLabel('Active Learning Language')).toBeDisabled();
      await expect(page.getByLabel('Active Learning Language')).toHaveValue(fixture.learningLanguageId);
      await expectSessionCard(page, firstCard);
      await expectProgress(page, 1, fixture.rows.length);
      await expect(page.getByText(/Translate from Spanish/i)).toBeVisible();
      await expect(page.getByText(/Translate from Italian/i)).toHaveCount(0);
      await expect(page.getByText('gatto', { exact: true })).toHaveCount(0);

      await confirmCurrentSessionCard(page, firstCard.expression, firstCard.translations[0]);
      await expectProgress(page, 2, fixture.rows.length);
      await page.reload();
      await expectSessionCard(page, secondCard);
      await expectProgress(page, 2, fixture.rows.length);
    } finally {
      await secondPage.close();
    }
    await expectNoMobileOverflow(page);
  });

  test('persists derived due ordering with Recognition before Recall on equal due times', async ({ page }) => {
    const fixture = await seedSessionFixture('scheduled-session-due-order', [['casa', 'house'], ['perro', 'dog']]);
    const initialRows = await scheduledReviewRows(fixture.client, fixture.learningLanguageId);
    const casaRecognition = initialRows.find((row) => row.expression === 'casa' && row.direction === 'recognition');
    const casaRecall = initialRows.find((row) => row.expression === 'casa' && row.direction === 'recall');
    const perroRecognition = initialRows.find((row) => row.expression === 'perro' && row.direction === 'recognition');
    if (!casaRecognition || !casaRecall || !perroRecognition) throw new Error('The due-ordering Card fixtures are missing.');

    const now = Date.now();
    const casaReviewAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const perroReviewAt = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    await recordFixtureReview(fixture.client, perroRecognition.id, perroReviewAt);
    await recordFixtureReview(fixture.client, casaRecognition.id, casaReviewAt);
    await recordFixtureReview(fixture.client, casaRecall.id, casaReviewAt);

    const rows = await scheduledReviewRows(fixture.client, fixture.learningLanguageId);
    const expectedRows = queueOrder(rows).filter((row) => deriveRecognitionCardSchedule({ createdAt: row.created_at, events: row.events }).due.getTime() <= Date.now());
    const createdRows = [...rows].sort((first, second) => {
      const createdAtDifference = first.created_at.localeCompare(second.created_at);
      if (createdAtDifference) return createdAtDifference;
      const directionDifference = (first.direction === 'recognition' ? 0 : 1) - (second.direction === 'recognition' ? 0 : 1);
      return directionDifference || first.id.localeCompare(second.id);
    });
    expect(expectedRows).toHaveLength(rows.length);
    expect(expectedRows.map((row) => row.id)).not.toEqual(createdRows.map((row) => row.id));
    expect(expectedRows.slice(0, 3).map((row) => row.id)).toEqual([perroRecognition.id, casaRecognition.id, casaRecall.id]);

    await signIn(page, fixture.account);
    await startScheduledReview(page);
    const sessionItems = await scheduledSessionItems(fixture.client, fixture.learningLanguageId);
    expect(sessionItems.map((item) => item.card_id)).toEqual(expectedRows.map((row) => row.id));
    await expectSessionCard(page, expectedRows[0]);
    await expectProgress(page, 1, expectedRows.length);
    await confirmCurrentSessionCard(page, expectedRows[0].expression, expectedRows[0].translations[0]);
    await expectProgress(page, 2, expectedRows.length);
    await expectSessionCard(page, expectedRows[1]);
    await confirmCurrentSessionCard(page, expectedRows[1].expression, expectedRows[1].translations[0]);
    await expectProgress(page, 3, expectedRows.length);
    await expectSessionCard(page, expectedRows[2]);
    await expectNoMobileOverflow(page);
  });

  test('keeps the started queue and confirmed progress after new Cards, navigation, reload, and browser restart', async ({ page, browser }) => {
    const fixture = await seedSessionFixture('scheduled-session-resume', [['casa', 'house'], ['perro', 'dog']]);
    await signIn(page, fixture.account);
    await startScheduledReview(page);
    const firstCard = fixture.rows[0];
    const secondCard = fixture.rows[1];

    await expectSessionCard(page, firstCard);
    await expectProgress(page, 1, fixture.rows.length);
    await captureEntry(fixture.client, fixture.learningLanguageId, 'en', 'nuevo', 'new');
    await confirmCurrentSessionCard(page, firstCard.expression, firstCard.translations[0]);
    await expectProgress(page, 2, fixture.rows.length);
    const { data: confirmedEvents, error: confirmedEventsError } = await fixture.client
      .from('review_events')
      .select('card_id')
      .eq('card_id', firstCard.id);
    if (confirmedEventsError) throw confirmedEventsError;
    expect(confirmedEvents).toHaveLength(1);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.goto('/review');
    await expectSessionCard(page, secondCard);
    await expect(page.getByText('nuevo', { exact: true })).toHaveCount(0);
    await expectProgress(page, 2, fixture.rows.length);

    await page.reload();
    await expectSessionCard(page, secondCard);
    await expect(page.getByText('nuevo', { exact: true })).toHaveCount(0);
    await expectProgress(page, 2, fixture.rows.length);

    const storageState = await page.context().storageState();
    const restartedContext = await browser.newContext({ storageState });
    const restartedPage = await restartedContext.newPage();
    try {
      await restartedPage.goto('/review');
      await expectSessionCard(restartedPage, secondCard);
      await expect(restartedPage.getByText('nuevo', { exact: true })).toHaveCount(0);
      await expectProgress(restartedPage, 2, fixture.rows.length);
    } finally {
      await restartedContext.close();
    }
    await expectNoMobileOverflow(page);
  });

  test('ends an unfinished session early while retaining confirmed outcomes and not resuming the abandoned queue', async ({ page }) => {
    const fixture = await seedSessionFixture('scheduled-session-end', [['casa', 'house'], ['perro', 'dog']]);
    await signIn(page, fixture.account);
    await startScheduledReview(page);
    const firstCard = fixture.rows[0];

    await confirmCurrentSessionCard(page, firstCard.expression, firstCard.translations[0]);
    await expectProgress(page, 2, fixture.rows.length);
    await page.getByRole('button', { name: /End (?:early|session|review)/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /ended|abandoned|complete/i })).toBeVisible();

    const { data: events, error } = await fixture.client.from('review_events').select('card_id, rating');
    if (error) throw error;
    expect(events).toHaveLength(1);
    expect(events?.[0].card_id).toBe(firstCard.id);

    await page.goto('/review');
    await expect(page.getByRole('link', { name: /Resume/i })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /ended|abandoned|No .*session/i })).toBeVisible();
    await expectNoMobileOverflow(page);
  });

  test('handles concurrent confirmation idempotently and exposes accessible completion', async ({ page }) => {
    const fixture = await seedSessionFixture('scheduled-session-idempotency', [['casa', 'house']]);
    await signIn(page, fixture.account);
    await startScheduledReview(page);
    const concurrentPage = await page.context().newPage();
    try {
      await concurrentPage.goto('/review');
      await expectSessionCard(concurrentPage, fixture.rows[0]);
      await expectSessionCard(page, fixture.rows[0]);

      const prepareConfirmation = async (reviewPage: Page) => {
        await expect(reviewPage.getByRole('heading', { name: 'Recognition' })).toBeVisible();
        await reviewPage.getByRole('button', { name: 'Reveal translation' }).click();
        await reviewPage.getByRole('radio', { name: 'Good', exact: true }).check();
      };
      await Promise.all([prepareConfirmation(page), prepareConfirmation(concurrentPage)]);
      await Promise.all([
        page.getByRole('button', { name: 'Confirm review' }).click(),
        concurrentPage.getByRole('button', { name: 'Confirm review' }).click(),
      ]);

      await expect(page.getByRole('status').filter({ hasText: /recorded|already|completed|session/i })).toBeVisible();
      await expect(concurrentPage.getByRole('status').filter({ hasText: /recorded|already|completed|session/i })).toBeVisible();
      const { data: events, error } = await fixture.client.from('review_events').select('card_id, rating');
      if (error) throw error;
      expect(events).toHaveLength(1);
      expect(events?.[0].card_id).toBe(fixture.rows[0].id);

      await page.reload();
      await expectSessionCard(page, fixture.rows[1]);
      await expectProgress(page, 2, fixture.rows.length);
      await confirmCurrentSessionCard(page, fixture.rows[1].expression, fixture.rows[1].translations[0]);
      await expect(page.getByRole('heading', { name: /Complete|Finished/i })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /complete|finished|2 of 2/i })).toBeVisible();
    } finally {
      await concurrentPage.close();
    }
    await expectNoMobileOverflow(page);
  });
});

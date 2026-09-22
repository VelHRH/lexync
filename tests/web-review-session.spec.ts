import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

type Account = ReturnType<typeof credentials>;
type CapturedEntry = {
  answerLanguageTag: string;
  expression: string;
  senseId: string;
  translation: string;
  translationId: string;
  vocabularyEntryId: string;
};

const vocabulary = [
  ['casa', 'house'],
  ['perro', 'dog'],
  ['nube', 'cloud'],
  ['libro', 'book'],
  ['mesa', 'table'],
  ['puerta', 'door'],
  ['agua', 'water'],
  ['camino', 'road'],
  ['árbol', 'tree'],
  ['luz', 'light'],
  ['mar', 'sea'],
  ['pan', 'bread'],
  ['reloj', 'clock'],
] as const;

function answerMap() {
  const answers = new Map<string, string>();
  for (const [expression, translation] of vocabulary) {
    answers.set(expression, translation);
    answers.set(translation, expression);
  }
  return answers;
}

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerLearner(prefix: string) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const { data: language, error: languageError } = await client.rpc('create_learning_language', { p_language_tag: 'es' });
  if (languageError) throw languageError;
  return { account, client, learningLanguageId: (language as { id: string }).id };
}

async function captureEntry(
  client: SupabaseClient,
  learningLanguageId: string,
  expression: string,
  translation: string,
  answerLanguageTag = 'en',
  options: { createNewSense?: boolean; senseId?: string } = {},
) {
  const { data, error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: answerLanguageTag,
    p_create_new_sense: options.createNewSense ?? false,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: options.senseId ?? null,
    p_translation: translation,
  });
  if (error) throw error;
  return data as CapturedEntry;
}

async function seedEntries(prefix: string, entries: ReadonlyArray<readonly [string, string]> = vocabulary.slice(0, 8)) {
  const fixture = await registerLearner(prefix);
  const captured: CapturedEntry[] = [];
  for (const [expression, translation] of entries) captured.push(await captureEntry(fixture.client, fixture.learningLanguageId, expression, translation));
  return { ...fixture, captured };
}

async function signIn(page: Page, account: Account) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

function reviewShell(page: Page) {
  return page.getByRole('main');
}

function reviewQuestion(page: Page) {
  return page.getByRole('region', { name: 'Review question' });
}

function answerChoices(page: Page) {
  return reviewQuestion(page).getByRole('radio');
}

function continueButton(page: Page) {
  return reviewShell(page).getByRole('button', { name: 'Continue' });
}

function reviewLaunch(page: Page, name: RegExp | string) {
  return page.getByRole('button', { name }).or(page.getByRole('link', { name }));
}

async function startFromHome(page: Page) {
  await reviewLaunch(page, /Start review|Resume review/).click();
  await expect(page).toHaveURL('/review');
  await expect(reviewQuestion(page)).toBeVisible();
}

async function questionSnapshot(page: Page) {
  const question = reviewQuestion(page);
  await expect.poll(async () => {
    const count = await answerChoices(page).count();
    return count >= 2 && count <= 4;
  }).toBe(true);
  return {
    choices: await answerChoices(page).evaluateAll((elements) => elements.map((element) => element.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ?? element.getAttribute('aria-label') ?? '')),
    prompt: (await question.getByRole('heading', { level: 1 }).innerText()).trim(),
    text: (await question.innerText()).replace(/\s+/g, ' ').trim(),
  };
}

async function selectAnswer(page: Page, choice: Locator) {
  const selectedValue = await choice.inputValue();
  await choice.check();
  await expect(reviewQuestion(page).getByRole('radio', { name: selectedValue, exact: true })).toBeChecked();
  await expect(answerChoices(page).first()).toBeDisabled();
  await expect(reviewShell(page).getByRole('status')).toContainText(/Correct|Incorrect/);
  await expect(continueButton(page)).toBeEnabled();
}

async function answerCurrentQuestion(page: Page, preferredAnswer?: string) {
  const choices = answerChoices(page);
  const choice = preferredAnswer ? reviewQuestion(page).getByRole('radio', { name: preferredAnswer, exact: true }) : choices.first();
  await selectAnswer(page, choice);
}

async function progressValue(page: Page, property: 'max' | 'value') {
  return reviewShell(page).getByRole('progressbar').evaluate((element, progressProperty) => {
    const progress = element as HTMLProgressElement;
    return progressProperty === 'max' ? progress.max : progress.value;
  }, property);
}

async function continueToNextQuestion(page: Page) {
  const currentPrompt = (await reviewQuestion(page).getByRole('heading', { level: 1 }).innerText()).trim();
  await continueButton(page).click();
  await expect.poll(async () => {
    if (await page.getByRole('heading', { name: 'Review complete', exact: true }).count()) return true;
    const nextQuestion = reviewQuestion(page);
    if (!(await nextQuestion.isVisible().catch(() => false))) return false;
    const nextPrompt = nextQuestion.getByRole('heading', { level: 1 });
    if (!(await nextPrompt.isVisible().catch(() => false))) return false;
    return (await nextPrompt.innerText()).trim() !== currentPrompt;
  }).toBe(true);
}

async function advance(page: Page) {
  const before = await progressValue(page, 'value');
  await continueToNextQuestion(page);
  await expect.poll(() => progressValue(page, 'value')).toBeGreaterThan(before);
}

async function completeSession(page: Page, answers = new Map<string, string>()) {
  const prompts: string[] = [];
  const directions: string[] = [];
  const choiceSets: string[][] = [];
  while (await reviewQuestion(page).count()) {
    const snapshot = await questionSnapshot(page);
    prompts.push(snapshot.prompt);
    directions.push(vocabulary.some(([expression]) => expression === snapshot.prompt) ? 'recognition' : 'recall');
    choiceSets.push(snapshot.choices.map((choice) => choice.trim()));
    await answerCurrentQuestion(page, answers.get(snapshot.prompt));
    await continueToNextQuestion(page);
  }
  await expect(reviewShell(page).getByRole('heading', { name: 'Review complete' })).toBeVisible();
  return { choiceSets, directions, prompts };
}

async function newSignedInContext(browser: Browser, page: Page) {
  return browser.newContext({ storageState: await page.context().storageState() });
}

async function bridgeEntryId(client: SupabaseClient, learningVocabularyEntryId: string) {
  const { data, error } = await client.from('vocabulary_entries').select('id').eq('learning_vocabulary_entry_id', learningVocabularyEntryId).limit(1).single();
  if (error) throw error;
  return data.id as string;
}

test.describe('web Review Session', () => {
  test('starts and resumes Review from Home for the Active Learning Language without exposing it in navigation', async ({ page }) => {
    const fixture = await seedEntries('review-home', vocabulary.slice(0, 3));
    await signIn(page, fixture.account);
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(navigation.getByRole('link', { name: 'Review', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Answer Language')).toHaveCount(0);
    await expect(page.getByLabel('Active Learning Language')).toHaveValue(fixture.learningLanguageId);
    await startFromHome(page);
    const initial = await questionSnapshot(page);
    await reviewShell(page).getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL('/');
    await expect(reviewLaunch(page, 'Resume review')).toBeVisible();
    await startFromHome(page);
    expect(await questionSnapshot(page)).toEqual(initial);
  });

  test('keeps Review unavailable until the Active Learning Language has two eligible Senses', async ({ page }) => {
    const fixture = await seedEntries('review-unavailable', vocabulary.slice(0, 1));
    await signIn(page, fixture.account);
    const unavailableLaunch = reviewLaunch(page, 'Start review');
    await expect.poll(async () => await unavailableLaunch.count() === 0 || await unavailableLaunch.isDisabled()).toBe(true);
    await expect(page.getByText(/at least two eligible Senses/i)).toBeVisible();
    await captureEntry(fixture.client, fixture.learningLanguageId, 'perro', 'dog');
    await page.reload();
    await expect(reviewLaunch(page, 'Start review')).toBeEnabled();
  });

  test('does not enable Review for sibling Senses with duplicate normalized translations', async ({ page }) => {
    const fixture = await registerLearner('review-duplicate-senses');
    await captureEntry(fixture.client, fixture.learningLanguageId, 'banco', 'bank');
    await captureEntry(fixture.client, fixture.learningLanguageId, 'banco', ' BANK ', 'en', { createNewSense: true });
    await signIn(page, fixture.account);
    await expect(page.getByText('0 Senses ready', { exact: true })).toBeVisible();
    const launch = reviewLaunch(page, 'Start review');
    await expect(launch).toBeDisabled();
    await expect(page.getByText(/at least two eligible Senses/i)).toBeVisible();
  });

  test('presents a responsive fullscreen exercise with stable actions and keyboard access', async ({ page }) => {
    const fixture = await seedEntries('review-shell');
    await signIn(page, fixture.account);
    await startFromHome(page);
    const shell = reviewShell(page);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    await expect(shell.getByRole('button', { name: 'Exit' })).toBeVisible();
    await expect(shell.getByText('Spanish', { exact: true })).toBeVisible();
    await expect(shell.locator('img[src*="/brand/mark-"]')).toHaveCount(1);
    await expect(shell.getByRole('progressbar', { name: 'Review progress' })).toBeVisible();
    await expect(reviewQuestion(page).getByRole('heading', { level: 1 })).toBeVisible();
    await expect(continueButton(page)).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();
    const continuePosition = await continueButton(page).boundingBox();
    const firstChoice = answerChoices(page).first();
    const firstChoiceValue = await firstChoice.inputValue();
    await firstChoice.focus();
    await expect(firstChoice).toBeFocused();
    await page.keyboard.press('Space');
    await expect(reviewQuestion(page).getByRole('radio', { name: firstChoiceValue, exact: true })).toBeChecked();
    await expect(continueButton(page)).toBeEnabled();
    const enabledContinuePosition = await continueButton(page).boundingBox();
    if (!continuePosition || !enabledContinuePosition) throw new Error('The stable Continue action is not measurable.');
    expect(enabledContinuePosition.y).toBe(continuePosition.y);
    await continueButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(answerChoices(page).first()).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('samples one stable unique-Sense queue, alternates directions, and prioritizes previously unpractised material', async ({ page }) => {
    const fixture = await seedEntries('review-generation', vocabulary);
    const answerByPrompt = answerMap();
    await signIn(page, fixture.account);
    await startFromHome(page);
    const progress = reviewShell(page).getByRole('progressbar', { name: 'Review progress' });
    const total = await progressValue(page, 'max');
    expect(total).toBeGreaterThanOrEqual(8);
    expect(total).toBeLessThanOrEqual(12);
    const initial = await questionSnapshot(page);
    await page.reload();
    expect(await questionSnapshot(page)).toEqual(initial);
    const first = await completeSession(page, answerByPrompt);
    expect(first.prompts).toHaveLength(total);
    expect(new Set(first.prompts).size).toBe(total);
    for (let index = 1; index < first.directions.length; index += 1) expect(first.directions[index]).not.toBe(first.directions[index - 1]);
    const practised = new Set(first.prompts.map((prompt) => vocabulary.find(([expression, translation]) => expression === prompt || translation === prompt)?.[0]));
    const unpractised = vocabulary.filter(([expression]) => !practised.has(expression));
    await reviewShell(page).getByRole('button', { name: 'Start another review' }).click();
    const nextPrompt = (await questionSnapshot(page)).prompt;
    expect(unpractised.some(([expression, translation]) => expression === nextPrompt || translation === nextPrompt)).toBe(true);
  });

  test('offers two to four credible multilingual choices without translations or sibling Senses from the prompted entry', async ({ page }) => {
    const fixture = await registerLearner('review-choices');
    const bank = await captureEntry(fixture.client, fixture.learningLanguageId, 'banco', 'bank');
    await captureEntry(fixture.client, fixture.learningLanguageId, 'banco', 'банк', 'uk', { senseId: bank.senseId });
    await captureEntry(fixture.client, fixture.learningLanguageId, 'banco', 'bench', 'en', { createNewSense: true });
    await captureEntry(fixture.client, fixture.learningLanguageId, 'río', 'river');
    await captureEntry(fixture.client, fixture.learningLanguageId, 'plaza', 'square');
    await captureEntry(fixture.client, fixture.learningLanguageId, 'cielo', 'sky');
    const { data: otherLanguage, error: otherLanguageError } = await fixture.client.rpc('create_learning_language', { p_language_tag: 'it' });
    if (otherLanguageError) throw otherLanguageError;
    await captureEntry(fixture.client, (otherLanguage as { id: string }).id, 'gatto', 'cat');
    await signIn(page, fixture.account);
    await startFromHome(page);
    let inspectedBanco = false;
    while (await reviewQuestion(page).count()) {
      const snapshot = await questionSnapshot(page);
      expect(snapshot.choices.length).toBeGreaterThanOrEqual(2);
      expect(snapshot.choices.length).toBeLessThanOrEqual(4);
      expect(new Set(snapshot.choices.map((choice) => choice.normalize().trim().toLocaleLowerCase())).size).toBe(snapshot.choices.length);
      expect(snapshot.choices).not.toContain('cat');
      expect(snapshot.choices).not.toContain('gatto');
      if (snapshot.prompt === 'banco' || ['bank', 'банк', 'bench'].includes(snapshot.prompt)) {
        inspectedBanco = true;
        if (snapshot.prompt === 'banco') expect(snapshot.choices.filter((choice) => ['bank', 'банк', 'bench'].includes(choice))).toHaveLength(1);
        else expect(snapshot.choices.filter((choice) => choice === 'banco')).toHaveLength(1);
      }
      await answerCurrentQuestion(page);
      await continueToNextQuestion(page);
    }
    expect(inspectedBanco).toBe(true);
  });

  test('records and locks one answer, announces semantic feedback, reveals the correction, and advances only on Continue', async ({ page }) => {
    const fixture = await seedEntries('review-feedback');
    await signIn(page, fixture.account);
    await startFromHome(page);
    const before = await questionSnapshot(page);
    const correct = answerMap().get(before.prompt);
    if (!correct) throw new Error('The feedback fixture prompt is unknown.');
    const wrongIndex = (await questionSnapshot(page)).choices.findIndex((choice) => choice !== correct);
    const wrong = answerChoices(page).nth(wrongIndex);
    const wrongValue = await wrong.inputValue();
    const colorBefore = await wrong.evaluate((element) => getComputedStyle(element.closest('label') ?? element).borderColor);
    await selectAnswer(page, wrong);
    expect(await questionSnapshot(page)).toEqual(expect.objectContaining({ prompt: before.prompt }));
    await expect(reviewShell(page).getByText('Incorrect', { exact: true })).toBeVisible();
    await expect(reviewShell(page).getByText('Correct answer', { exact: true })).toBeVisible();
    await expect(reviewQuestion(page).locator('svg, img').first()).toBeVisible();
    const colorAfter = await reviewQuestion(page).getByRole('radio', { name: wrongValue, exact: true }).evaluate((element) => getComputedStyle(element.closest('label') ?? element).borderColor);
    expect(colorAfter).not.toBe(colorBefore);
    await advance(page);
    expect((await questionSnapshot(page)).prompt).not.toBe(before.prompt);
  });

  test('resumes stable server state after exit, reload, tabs, and a fresh browser context and converges concurrent answers', async ({ page, browser }) => {
    const fixture = await seedEntries('review-resume');
    await signIn(page, fixture.account);
    await startFromHome(page);
    const initial = await questionSnapshot(page);
    await page.reload();
    expect(await questionSnapshot(page)).toEqual(initial);
    const concurrentPage = await page.context().newPage();
    const restartedContext = await newSignedInContext(browser, page);
    const restartedPage = await restartedContext.newPage();
    try {
      await Promise.all([concurrentPage.goto('/review'), restartedPage.goto('/review')]);
      expect(await questionSnapshot(concurrentPage)).toEqual(initial);
      expect(await questionSnapshot(restartedPage)).toEqual(initial);
      await Promise.all([answerChoices(page).first().check(), answerChoices(concurrentPage).first().check()]);
      await Promise.all([
        expect(reviewShell(page).getByRole('status')).toContainText(/Correct|Incorrect/),
        expect(reviewShell(concurrentPage).getByRole('status')).toContainText(/Correct|Incorrect/),
      ]);
      const { data: session, error: sessionError } = await fixture.client.rpc('review_session_overview', { p_learning_language_id: fixture.learningLanguageId });
      if (sessionError) throw sessionError;
      const payload = session as { id: string; questions: Array<{ id: string }> };
      const { count, error: attemptsError } = await fixture.client.from('review_attempts').select('id', { count: 'exact', head: true }).eq('session_id', payload.id).eq('question_id', payload.questions[0].id);
      if (attemptsError) throw attemptsError;
      expect(count).toBe(1);
      await page.reload();
      await expect(continueButton(page)).toBeEnabled();
      await reviewShell(page).getByRole('button', { name: 'Exit' }).click();
      await expect(page).toHaveURL('/');
      await expect(reviewLaunch(page, 'Resume review')).toBeVisible();
    } finally {
      await concurrentPage.close();
      await restartedContext.close();
    }
  });

  test('keeps snapshots through edits and prunes deleted or suspended unanswered material', async ({ page }) => {
    const fixture = await seedEntries('review-material');
    await signIn(page, fixture.account);
    await startFromHome(page);
    const first = await questionSnapshot(page);
    const untouched = fixture.captured.filter((entry) => !first.text.includes(entry.expression) && !first.text.includes(entry.translation));
    const [edited, suspended, deleted] = untouched;
    if (!edited || !suspended || !deleted) throw new Error('The Review material fixture is incomplete.');
    const editedBridgeId = await bridgeEntryId(fixture.client, edited.vocabularyEntryId);
    const suspendedBridgeId = await bridgeEntryId(fixture.client, suspended.vocabularyEntryId);
    const deletedBridgeId = await bridgeEntryId(fixture.client, deleted.vocabularyEntryId);
    const { error: editError } = await fixture.client.rpc('update_vocabulary_entry', {
      p_expression: `${edited.expression}-edited`,
      p_senses: [{ examples: [], id: edited.senseId, translations: [{ id: edited.translationId, text: `${edited.translation}-edited` }] }],
      p_vocabulary_entry_id: editedBridgeId,
    });
    if (editError) throw editError;
    const { error: suspensionError } = await fixture.client.rpc('set_vocabulary_entry_suspended', { p_suspended: true, p_vocabulary_entry_id: suspendedBridgeId });
    if (suspensionError) throw suspensionError;
    const { error: deletionError } = await fixture.client.rpc('delete_vocabulary_entry', { p_vocabulary_entry_id: deletedBridgeId });
    if (deletionError) throw deletionError;
    await page.reload();
    await expect(reviewQuestion(page)).toBeVisible();
    const visible: string[] = [];
    const positions: number[] = [];
    while (await reviewQuestion(page).count()) {
      const snapshot = await questionSnapshot(page);
      visible.push(snapshot.text);
      const position = await reviewShell(page).getByText(/^Question \d+ of \d+$/).innerText();
      positions.push(Number(position.match(/^Question (\d+) of/)?.[1]));
      await answerCurrentQuestion(page);
      await continueToNextQuestion(page);
    }
    expect(positions).toEqual(positions.map((_, index) => index + 1));
    expect(visible.some((text) => text.includes(edited.expression) || text.includes(edited.translation))).toBe(true);
    expect(visible.every((text) => !text.includes(`${edited.expression}-edited`) && !text.includes(`${edited.translation}-edited`))).toBe(true);
    expect(visible.every((text) => !text.includes(suspended.expression) && !text.includes(suspended.translation))).toBe(true);
    expect(visible.every((text) => !text.includes(deleted.expression) && !text.includes(deleted.translation))).toBe(true);
  });

  test('shows a durable score and missed-answer details and allows unlimited repeated sessions', async ({ page }) => {
    const fixture = await seedEntries('review-result');
    await signIn(page, fixture.account);
    await startFromHome(page);
    const total = await progressValue(page, 'max');
    const first = await questionSnapshot(page);
    const completedPrompt = first.prompt;
    const correct = answerMap().get(first.prompt);
    const wrong = (await questionSnapshot(page)).choices.find((choice) => choice !== correct);
    if (!wrong || !correct) throw new Error('The score fixture could not choose a wrong answer.');
    await answerCurrentQuestion(page, wrong);
    await continueToNextQuestion(page);
    while (await reviewQuestion(page).count()) {
      await answerCurrentQuestion(page);
      await continueToNextQuestion(page);
    }
    const result = reviewShell(page);
    await expect(result.getByRole('heading', { name: 'Review complete' })).toBeVisible();
    await expect(result.getByText(new RegExp(`\\d+/${total}`))).toBeVisible();
    await expect(result.getByText(/\d+%/)).toBeVisible();
    const missed = result.getByRole('region', { name: 'Missed answers' });
    await expect(missed.getByText(wrong, { exact: true }).first()).toBeVisible();
    await expect(missed.getByText(correct, { exact: true }).first()).toBeVisible();
    await expect(result.getByText(/\b(?:due|schedule|rating|again|hard|good|easy)\b/i)).toHaveCount(0);
    await expect(reviewLaunch(page, 'Back to Home')).toBeVisible();
    const completedEntry = fixture.captured.find((entry) => entry.expression === completedPrompt || entry.translation === completedPrompt);
    if (!completedEntry) throw new Error('The completed Review fixture prompt is unknown.');
    const completedBridgeId = await bridgeEntryId(fixture.client, completedEntry.vocabularyEntryId);
    const { error: suspensionError } = await fixture.client.rpc('set_vocabulary_entry_suspended', { p_suspended: true, p_vocabulary_entry_id: completedBridgeId });
    if (suspensionError) throw suspensionError;
    await page.reload();
    await expect(result.getByText(new RegExp(`\\d+/${total}`))).toBeVisible();
    await expect(missed.getByText(wrong, { exact: true }).first()).toBeVisible();
    await result.getByRole('button', { name: 'Start another review' }).click();
    await expect(reviewQuestion(page)).toBeVisible();
    expect((await questionSnapshot(page)).prompt).not.toBe(completedPrompt);
    await reviewShell(page).getByRole('button', { name: 'Exit' }).click();
    await reviewLaunch(page, 'Resume review').click();
    await expect(reviewQuestion(page)).toBeVisible();
    await reviewShell(page).getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL('/');
  });

  test('remains reachable on mobile, at 200 percent zoom, and with reduced motion', async ({ page }) => {
    const fixture = await seedEntries('review-responsive');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, fixture.account);
    await startFromHome(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await expect(reviewQuestion(page)).toBeVisible();
    await expect(answerChoices(page).last()).toBeVisible();
    await expect(continueButton(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const motion = await page.locator('body *').evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return { animation: style.animationDuration, transition: style.transitionDuration };
    }));
    expect(motion.every(({ animation, transition }) => Number.parseFloat(animation) <= 0.01 && Number.parseFloat(transition) <= 0.01)).toBe(true);
  });
});

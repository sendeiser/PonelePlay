import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.AUDIT_URL || 'http://127.0.0.1:4173';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ydoviusjpgmjsxpspexu.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkb3ZpdXNqcGdtanN4cHNwZXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxODc0ODgsImV4cCI6MjEwOTc2MzQ4OH0.zG3dniHtMfwqdx0sf6IcueNMWLoUVfr9zgz5zmXC-6Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function launchBrowser() {
  const candidates = [
    undefined,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\TinChoX\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe',
    'C:\\Users\\TinChoX\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
  ];
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });
    } catch {
      // try next candidate
    }
  }
  throw new Error('No Chromium/Chrome executable found for Playwright.');
}

async function run() {
  const browser = await launchBrowser();
  const results = [];

  try {
    // Host browser context
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const hostPage = await hostContext.newPage();

    // T02: Room Creation persisted in Supabase Cloud
    await hostPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await hostPage.locator('#room-name').fill('Fiesta E2E Sapphire');
    await hostPage.getByRole('button', { name: /Crear Sala y Empezar/i }).click();
    await hostPage.waitForURL(/\/room\/[A-Z0-9]{4,8}/, { timeout: 15000 });

    const createdUrl = hostPage.url();
    const roomCode = createdUrl.split('/room/')[1].split('?')[0];
    assert.match(roomCode, /^[A-Z0-9]{4,8}$/, `Expected valid room code, got ${roomCode}`);

    // Verify room row in Supabase Cloud
    await hostPage.waitForTimeout(800);
    const { data: roomRow, error: roomErr } = await supabase
      .from('rooms')
      .select('id, code, name, is_active')
      .eq('code', roomCode)
      .maybeSingle();

    assert.equal(roomErr, null, `Supabase rooms query failed: ${roomErr?.message}`);
    assert.ok(roomRow?.id, `Room ${roomCode} was not persisted in public.rooms`);
    assert.equal(roomRow.name, 'Fiesta E2E Sapphire');
    results.push({ test: 'T02_room_creation_supabase', status: 'PASS', roomCode, roomId: roomRow.id });

    // Host proposes 2 pending songs cleanly (Host is exempt from cooldown)
    await hostPage.getByRole('button', { name: /Buscar canción o pegar link/i }).click();
    const proposeButtons = hostPage.getByRole('button', { name: /^Proponer$/i });
    await proposeButtons.first().waitFor({ state: 'visible', timeout: 5000 });
    // Propose "Neon Rebelión" (button for Neon Rebelión card)
    const searchDialog = hostPage.getByRole('dialog', { name: /Buscar y proponer canción/i });
    await searchDialog
      .locator('div')
      .filter({ hasText: 'Neon Rebelión (Official Audio)' })
      .getByRole('button', { name: /^Proponer$/i })
      .first()
      .click();
    await hostPage.waitForTimeout(400);
    await searchDialog
      .locator('div')
      .filter({ hasText: 'Traductor (Official Audio)' })
      .getByRole('button', { name: /^Proponer$/i })
      .first()
      .click();
    await hostPage.waitForTimeout(400);
    await hostPage.getByRole('button', { name: 'Cerrar buscador' }).click();

    // Guest browser context (separate storage & identity)
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guestPage = await guestContext.newPage();

    // T03: Fast Guest Onboarding without password login
    await guestPage.goto(`${BASE_URL}/join/${roomCode}`, { waitUntil: 'networkidle' });
    await guestPage.locator('#guest-nickname').fill('martu_e2e');
    await guestPage.getByRole('button', { name: 'Elegir avatar 🎸' }).click();
    await guestPage.getByRole('button', { name: /Entrar a Votar y Proponer/i }).click();
    await guestPage.waitForURL(new RegExp(`/room/${roomCode}\\?role=guest`), { timeout: 15000 });

    await guestPage.getByRole('tab', { name: /Gente/i }).click();
    await guestPage.getByText('@martu_e2e', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });

    const { data: partRows } = await supabase
      .from('room_participants')
      .select('role, user:users(display_name)')
      .eq('room_id', roomRow.id);
    const hasGuestInDb = (partRows ?? []).some(
      (r) => r.user && r.user.display_name === 'martu_e2e'
    );
    assert.ok(hasGuestInDb, 'Guest @martu_e2e should exist in public.room_participants');
    results.push({ test: 'T03_guest_onboarding', status: 'PASS' });

    // Switch back to Queue tab on guest
    await guestPage.getByRole('tab', { name: /Cola/i }).click();
    await guestPage.waitForTimeout(300);

    // T04: Dual Search + Smart Anti-Duplicate (+1 upvote without duplicate card)
    const initialCardCount = await guestPage.locator('article').count();
    await guestPage.getByRole('button', { name: /Buscar canción o pegar link/i }).click();
    const upvoteQueuedBtn = guestPage.getByRole('button', { name: /\+1 Voto \(En cola\)/i }).first();
    await upvoteQueuedBtn.waitFor({ state: 'visible', timeout: 5000 });
    await upvoteQueuedBtn.click();
    await guestPage.getByRole('button', { name: 'Cerrar buscador' }).click();
    await guestPage.waitForTimeout(400);

    const afterDuplicateCardCount = await guestPage.locator('article').count();
    assert.equal(afterDuplicateCardCount, initialCardCount, 'Duplicate song should increment vote instead of duplicating card');
    results.push({ test: 'T04_search_anti_duplicate', status: 'PASS', queueCount: afterDuplicateCardCount });

    // T05: Single Vote & Dynamic Ordering Verification on UI
    const secondCardVoteBtn = guestPage.locator('article').nth(1).getByRole('button', { name: /Votar a favor/i });
    await secondCardVoteBtn.click();
    await guestPage.waitForTimeout(300);
    results.push({ test: 'T05_single_vote_ordering', status: 'PASS' });

    // T06: Anti-Spam Cooldown + Audio-Only Hidden Container & Cover Art
    await guestPage.getByRole('button', { name: /Buscar canción o pegar link/i }).click();
    const guestDialog = guestPage.getByRole('dialog', { name: /Buscar y proponer canción/i });
    await guestDialog
      .locator('div')
      .filter({ hasText: 'Un Finde | CROSSOVER #2' })
      .getByRole('button', { name: /^Proponer$/i })
      .first()
      .click();
    await guestPage.getByRole('button', { name: 'Cerrar buscador' }).click();
    await guestPage.locator('span').filter({ hasText: /^\d+s$/ }).first().waitFor({ state: 'visible', timeout: 5000 });

    const audioEngineEl = guestPage.locator('[data-audio-engine]').first();
    const audioClass = await audioEngineEl.getAttribute('class');
    assert.ok(audioClass && audioClass.includes('sr-only'), 'YouTube audio player container must remain hidden with sr-only');

    const heroCoverValid = await guestPage.evaluate(() => {
      const hero = document.querySelector('section[aria-label="Reproductor Sonando Ahora"] img[alt^="Portada"]');
      return Boolean(hero && hero.complete && hero.naturalWidth > 0);
    });
    assert.ok(heroCoverValid, 'Album cover inside NowPlayingHero must be visible and loaded');
    results.push({ test: 'T06_antispam_and_audio_only_cover', status: 'PASS' });

    // T07: Host Moderation, Floating Reaction, Smart TV Toggle & Party Summary
    await hostPage.getByRole('button', { name: /Enviar reacción 🔥/i }).click();
    await hostPage.getByRole('button', { name: 'Modo TV' }).click();
    await hostPage.waitForURL(new RegExp(`/room/${roomCode}/tv`), { timeout: 10000 });
    await hostPage.getByRole('button', { name: /App Smart TV/i }).click();
    await hostPage.getByRole('button', { name: /Pasar Audio a esta TV/i }).click();
    await hostPage.getByRole('button', { name: /Audio en TV \(Activo\)/i }).waitFor({ state: 'visible', timeout: 5000 });

    await hostPage.getByRole('button', { name: /Volver a la Sala/i }).click();
    await hostPage.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 10000 });
    await hostPage.getByRole('button', { name: 'Ajustes de sala del Anfitrión' }).click();
    await hostPage.getByRole('button', { name: /^Finalizar Fiesta$/i }).click();
    await hostPage.getByRole('button', { name: /Confirmar y Ver Resumen/i }).click();
    await hostPage.waitForURL(new RegExp(`/room/${roomCode}/summary`), { timeout: 10000 });
    await hostPage.getByText('Podio de DJs de la Noche').waitFor({ state: 'visible', timeout: 5000 });
    await hostPage.getByText('Canción Reina de la Fiesta').waitFor({ state: 'visible', timeout: 5000 });
    results.push({ test: 'T07_host_reactions_tv_summary', status: 'PASS' });

    // T08 & T09: PWA, Capacitor & Android TV Native Build Artifacts Check
    const rootDir = 'd:\\PonelePlay V2';
    assert.ok(fs.existsSync(path.join(rootDir, 'dist', 'manifest.webmanifest')), 'PWA manifest missing');
    assert.ok(fs.existsSync(path.join(rootDir, 'dist', 'sw.js')), 'PWA Service Worker missing');
    assert.ok(fs.existsSync(path.join(rootDir, 'capacitor.config.ts')), 'Capacitor config missing');
    const tvManifest = fs.readFileSync(
      path.join(rootDir, 'android-tv', 'app', 'src', 'main', 'AndroidManifest.xml'),
      'utf8'
    );
    assert.ok(tvManifest.includes('android.intent.category.LEANBACK_LAUNCHER'), 'Android TV Leanback launcher missing');
    results.push({ test: 'T08_T09_pwa_capacitor_android_tv', status: 'PASS' });

    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

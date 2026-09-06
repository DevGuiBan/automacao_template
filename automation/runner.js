'use strict';

const { chromium } = require('playwright-core');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = 'https://painel.vsfy.pro';
const TEMPLATES_URL = `${BASE_URL}/supervisor/templates`;
const DEBUG_PORT = 9333;

const NAME_PLACEHOLDER = /promo_credito_01/i;
const HEADER_PLACEHOLDER = /Atualiza[cç][aã]o da sua margem/i;
const BODY_PLACEHOLDER = /Escreva o texto que o cliente vai receber/i;
const FOOTER_PLACEHOLDER = /Responda para falar com um consultor/i;
const BUTTON_PLACEHOLDER = /^Bot[aã]o \d+$/i;
const CONFIRM_TEXT = /confirmar|continuar|ok\b|sim\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChromeExecutable() {
  const candidates = [];
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || '';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
  }
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

function defaultChromeUserDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'User Data');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
}

function isChromeRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq chrome.exe"').toString();
      return /chrome\.exe/i.test(out);
    }
    const out = execSync('pgrep -x "Google Chrome" 2>/dev/null || true').toString();
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

async function openBrowserAttached(log) {
  const chromePath = findChromeExecutable();
  if (!chromePath) {
    throw new Error('Não encontrei o Google Chrome instalado neste computador. Instale o Chrome para usar esta automação.');
  }
  if (isChromeRunning()) {
    throw new Error('Feche TODAS as janelas do Chrome primeiro (preciso iniciá-lo com uma opção especial de depuração) e tente de novo.');
  }
  log('Abrindo o seu Chrome principal com depuração remota...');
  const userDataDir = defaultChromeUserDataDir();
  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();

  const endpoint = `http://127.0.0.1:${DEBUG_PORT}`;
  const start = Date.now();
  let browser;
  while (Date.now() - start < 20000) {
    try {
      browser = await chromium.connectOverCDP(endpoint);
      break;
    } catch (err) {
      await sleep(500);
    }
  }
  if (!browser) {
    throw new Error('Não consegui conectar ao Chrome principal. Feche todas as janelas do Chrome e tente de novo.');
  }
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(TEMPLATES_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  log('Conectado ao seu Chrome principal.');
  return { context, page, browser };
}

async function waitForLogin(page, log, shouldStop) {
  log('Aguardando login (verificando a cada 2s se a sessão está ativa)...');
  while (!shouldStop()) {
    const url = page.url();
    if (/\/supervisor(\/|$)/.test(url) && !/\/login/i.test(url)) {
      // double check page actually rendered the panel and not a login form
      const hasLoginForm = await page
        .locator('input[type="password"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (!hasLoginForm) {
        log('Login detectado. Sessão ativa.');
        return true;
      }
    }
    await sleep(2000);
  }
  return false;
}

async function ensureTemplatesPage(page, log) {
  if (!page.url().includes('/supervisor/templates')) {
    log('Voltando para a página de Templates...');
    await page.goto(TEMPLATES_URL, { waitUntil: 'domcontentloaded' });
  }
}

async function openNewTemplateForm(page, log) {
  const nameInput = page.getByPlaceholder(NAME_PLACEHOLDER);
  if (await nameInput.isVisible().catch(() => false)) {
    return; // form already open
  }
  const newTemplateBtn = page.getByRole('button', { name: /novo template/i }).first();
  await newTemplateBtn.click();
  await nameInput.waitFor({ state: 'visible', timeout: 15000 });
}

async function fillTemplateForm(page, tpl, log) {
  const nameInput = page.getByPlaceholder(NAME_PLACEHOLDER);
  await nameInput.fill(tpl.nome || '');

  if (tpl.departamento) {
    const select = page.locator('select').first();
    try {
      await select.selectOption({ label: tpl.departamento });
    } catch (err) {
      log(`Aviso: não encontrei o departamento "${tpl.departamento}", mantendo o padrão.`, 'warn');
    }
  }

  if (tpl.titulo) {
    await page.getByPlaceholder(HEADER_PLACEHOLDER).fill(tpl.titulo);
  }

  if (tpl.imagemPath) {
    const imageInput = page.locator('input[type="file"][accept*="webp"]').first();
    await imageInput.setInputFiles(tpl.imagemPath);
    log(`Imagem anexada: ${tpl.imagemPath}`);
  }

  await page.getByPlaceholder(BODY_PLACEHOLDER).fill(tpl.corpo || '');

  if (tpl.rodape) {
    await page.getByPlaceholder(FOOTER_PLACEHOLDER).fill(tpl.rodape);
  }

  const botoes = (tpl.botoes || []).filter((b) => b && b.trim());
  for (let i = 0; i < botoes.length && i < 3; i++) {
    const addBtn = page.getByRole('button', { name: /adicionar bot[aã]o/i });
    await addBtn.click();
    const buttonInputs = page.getByPlaceholder(BUTTON_PLACEHOLDER);
    const count = await buttonInputs.count();
    await buttonInputs.nth(count - 1).fill(botoes[i]);
  }
}

async function waitForFormClosed(page, timeoutMs, shouldStop) {
  const start = Date.now();
  const nameInput = page.getByPlaceholder(NAME_PLACEHOLDER);
  while (Date.now() - start < timeoutMs) {
    if (shouldStop && shouldStop()) return false;
    const visible = await nameInput.isVisible().catch(() => false);
    if (!visible) return true;
    await sleep(1000);
  }
  return false;
}

async function submitAndConfirm(page, log) {
  const submitBtn = page.getByRole('button', { name: /enviar para an[aá]lise/i });
  await submitBtn.click();
  log('Cliquei em "Enviar para análise". Verificando se aparece confirmação de categoria...');

  // Give the app a moment to show an AI-category confirmation dialog, if any.
  await sleep(1500);
  const confirmBtn = page.getByRole('button', { name: CONFIRM_TEXT }).last();
  const appeared = await confirmBtn.isVisible({ timeout: 4000 }).catch(() => false);
  if (appeared) {
    log('Modal de confirmação apareceu, confirmando...');
    await confirmBtn.click().catch(() => {});
  }
}

async function createOneTemplate(page, tpl, opts, log, shouldStop) {
  await ensureTemplatesPage(page, log);
  await openNewTemplateForm(page, log);
  await fillTemplateForm(page, tpl, log);

  if (opts.pauseBeforeSubmit) {
    log(`Template "${tpl.nome}" preenchido. Revise na tela e clique em "Enviar para análise" você mesmo(a) no navegador.`, 'action');
    const closed = await waitForFormClosed(page, 1000 * 60 * 30, shouldStop); // up to 30 min
    if (!closed) {
      log(`Parado antes de concluir "${tpl.nome}".`, 'warn');
      return false;
    }
    log(`Template "${tpl.nome}" enviado.`, 'success');
    return true;
  }

  await submitAndConfirm(page, log);
  const closed = await waitForFormClosed(page, 30000, shouldStop);
  if (!closed) {
    log(`Não consegui confirmar que "${tpl.nome}" foi enviado — verifique manualmente no navegador (pode haver um erro de validação no formulário).`, 'warn');
    return false;
  }
  log(`Template "${tpl.nome}" enviado com sucesso.`, 'success');
  return true;
}

async function runAll(page, templates, opts, log, shouldStop) {
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < templates.length; i++) {
    if (shouldStop()) {
      log('Automação interrompida pelo usuário.', 'warn');
      break;
    }
    const tpl = templates[i];
    log(`--- Template ${i + 1}/${templates.length}: ${tpl.nome} ---`);
    try {
      const success = await createOneTemplate(page, tpl, opts, log, shouldStop);
      if (success) ok++;
      else fail++;
    } catch (err) {
      fail++;
      log(`Erro ao criar "${tpl.nome}": ${err.message}`, 'error');
    }
  }
  log(`Concluído. Sucesso: ${ok}. Falhas/pendentes: ${fail}.`, ok && !fail ? 'success' : 'info');
  return { ok, fail };
}

module.exports = {
  openBrowserAttached,
  waitForLogin,
  runAll,
  // exported for manual/dev testing:
  ensureTemplatesPage,
  openNewTemplateForm,
  fillTemplateForm,
};

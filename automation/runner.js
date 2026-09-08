'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://painel.vsfy.pro';
const TEMPLATES_URL = `${BASE_URL}/supervisor/templates`;

const NAME_PLACEHOLDER = /promo_credito_01/i;
const HEADER_PLACEHOLDER = /Atualiza[cç][aã]o da sua margem/i;
const BODY_PLACEHOLDER = /Escreva o texto que o cliente vai receber/i;
const FOOTER_PLACEHOLDER = /Responda para falar com um consultor/i;
const BUTTON_PLACEHOLDER = /^Bot[aã]o \d+$/i;
const CONFIRM_TEXT = /confirmar|continuar|ok\b|sim\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Types like a person: clicks the field first, small pause, then keystroke-by-keystroke
// with a slightly randomized delay per character instead of pasting the whole value at once.
async function humanType(locator, text, log) {
  if (!text) return;
  await locator.click();
  await sleep(randomBetween(150, 400));
  await locator.pressSequentially(text, { delay: randomBetween(35, 90) });
  await sleep(randomBetween(100, 300));
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

async function openBrowser(userDataDir, log) {
  if (!findChromeExecutable()) {
    throw new Error('Não encontrei o Google Chrome instalado neste computador. Instale o Chrome para usar esta automação.');
  }
  log('Abrindo o navegador (usa seu Chrome instalado, com um perfil próprio do app)...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(TEMPLATES_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  log('Navegador aberto. Se for a primeira vez, faça login manualmente na aba que abriu — nas próximas vezes a sessão já estará salva.');
  return { context, page };
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
  await humanType(nameInput, tpl.nome || '', log);

  if (tpl.departamento) {
    await sleep(randomBetween(200, 500));
    const select = page.locator('select').first();
    try {
      await select.click();
      await sleep(randomBetween(150, 350));
      await select.selectOption({ label: tpl.departamento });
    } catch (err) {
      log(`Aviso: não encontrei o departamento "${tpl.departamento}", mantendo o padrão.`, 'warn');
    }
  }

  if (tpl.titulo) {
    await humanType(page.getByPlaceholder(HEADER_PLACEHOLDER), tpl.titulo, log);
  }

  if (tpl.imagemPath) {
    await sleep(randomBetween(200, 500));
    const imageInput = page.locator('label:has-text("Anexar imagem") input[type="file"]').first();
    await imageInput.setInputFiles(tpl.imagemPath);
    log(`Imagem anexada: ${tpl.imagemPath}`);
    await sleep(randomBetween(300, 600));
  }

  await humanType(page.getByPlaceholder(BODY_PLACEHOLDER), tpl.corpo || '', log);

  if (tpl.rodape) {
    await humanType(page.getByPlaceholder(FOOTER_PLACEHOLDER), tpl.rodape, log);
  }

  const botoes = (tpl.botoes || []).filter((b) => b && b.trim());
  for (let i = 0; i < botoes.length && i < 3; i++) {
    await sleep(randomBetween(250, 550));
    const addBtn = page.getByRole('button', { name: /adicionar bot[aã]o/i });
    await addBtn.click();
    await sleep(randomBetween(150, 350));
    const buttonInputs = page.getByPlaceholder(BUTTON_PLACEHOLDER);
    const count = await buttonInputs.count();
    await humanType(buttonInputs.nth(count - 1), botoes[i], log);
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

  // The VSFY IA category check can take a while to respond — give it a generous window
  // so we don't miss the modal and leave it stuck open, blocking the next template.
  // (isVisible() checks once and returns immediately — waitFor() is what actually polls.)
  const confirmBtn = page.getByRole('button', { name: CONFIRM_TEXT }).last();
  const appeared = await confirmBtn
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    log('Modal de confirmação apareceu, confirmando...');
    await confirmBtn.click().catch(() => {});
  } else {
    log('Nenhum modal de confirmação apareceu a tempo.', 'warn');
  }
}

// Reload the templates page so a leftover modal/overlay from a failed attempt
// doesn't block the next template in the batch.
async function recoverPage(page, log) {
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await page.goto(TEMPLATES_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (err) {
    log(`Aviso: não consegui recarregar a página antes do próximo template (${err.message}).`, 'warn');
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
      if (success) {
        ok++;
      } else {
        fail++;
        if (!shouldStop()) await recoverPage(page, log);
      }
    } catch (err) {
      fail++;
      log(`Erro ao criar "${tpl.nome}": ${err.message}`, 'error');
      if (!shouldStop()) await recoverPage(page, log);
    }
  }
  log(`Concluído. Sucesso: ${ok}. Falhas/pendentes: ${fail}.`, ok && !fail ? 'success' : 'info');
  return { ok, fail };
}

module.exports = {
  openBrowser,
  waitForLogin,
  runAll,
  // exported for manual/dev testing:
  ensureTemplatesPage,
  openNewTemplateForm,
  fillTemplateForm,
};

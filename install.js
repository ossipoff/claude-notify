#!/usr/bin/env node
/**
 * Installs claude-notify on Windows, macOS and Linux:
 * copies src/ to ~/.claude/claude-notify, registers notify.js as the Notification hook
 * in ~/.claude/settings.json (backup first) and, on Windows, registers the claude-notify://
 * protocol that focus.ps1 handles when a toast is clicked. Safe to run again after changes.
 *
 *   node install.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = __dirname;
const claudeHome = path.join(os.homedir(), '.claude');
const installDir = path.join(claudeHome, 'claude-notify');
const settingsPath = path.join(claudeHome, 'settings.json');

const ownHookPattern = /claude-notify[\\/]notify\.js/;

function copySources() {
  fs.mkdirSync(installDir, { recursive: true });
  for (const file of ['notify.js', 'focus.ps1']) {
    fs.copyFileSync(path.join(repo, 'src', file), path.join(installDir, file));
  }
  console.log(`Copied: ${installDir}`);
}

function registerProtocol() {
  if (process.platform !== 'win32') return;
  const key = 'HKCU\\Software\\Classes\\claude-notify';
  const handler = `conhost.exe --headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${path.join(installDir, 'focus.ps1')}" "%1"`;
  for (const args of [
    ['add', key, '/ve', '/d', 'URL:claude-notify', '/f'],
    ['add', key, '/v', 'URL Protocol', '/d', '', '/f'],
    ['add', `${key}\\shell\\open\\command`, '/ve', '/d', handler, '/f'],
  ]) {
    const result = spawnSync('reg', args, { stdio: 'pipe', encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`reg ${args.join(' ')} failed: ${result.stderr}`);
  }
  console.log(`Protocol registered: ${key}`);
}

function hookCommand() {
  const hookPath = path.join(installDir, 'notify.js').replace(/\\/g, '/');
  return `node "${hookPath}"`;
}

function withoutOwnHooks(groups) {
  return groups
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !ownHookPattern.test(h.command ?? '')) }))
    .filter((group) => group.hooks.length > 0);
}

function registerHooks() {
  const original = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8').replace(/^﻿/, '') : '{}';
  const settings = JSON.parse(original);
  settings.hooks ??= {};
  for (const eventName of Object.keys(settings.hooks)) {
    const remaining = withoutOwnHooks(settings.hooks[eventName] ?? []);
    if (remaining.length > 0) settings.hooks[eventName] = remaining;
    else delete settings.hooks[eventName];
  }
  settings.hooks.Notification = [
    ...(settings.hooks.Notification ?? []),
    { hooks: [{ type: 'command', command: hookCommand(), timeout: 10 }] },
  ];
  if (JSON.stringify(JSON.parse(original)) === JSON.stringify(settings)) {
    console.log('Hook already registered in settings.json');
    return;
  }
  if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, `${settingsPath}.bak`);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`Hook registered in ${settingsPath} (backup: settings.json.bak)`);
}

try {
  copySources();
  registerProtocol();
  registerHooks();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

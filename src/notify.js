#!/usr/bin/env node
/**
 * Claude Code Notification hook. Reads the hook payload from stdin and shows a desktop
 * notification titled with the folder name and the session title, so you can tell which session is waiting.
 *
 *   Windows  WinRT toast through PowerShell; a click opens claude-notify:// and focus.ps1
 *            brings the session's window to the front
 *   macOS    osascript "display notification"
 *   Linux    notify-send, silently skipped when it is missing
 *
 * The hook waits for the notifier: Claude Code kills a detached child when the hook exits.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const appName = 'Claude Code';

const windowsToastScript = `
$processes = @{}
Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId | ForEach-Object { $processes[[int]$_.ProcessId] = [int]$_.ParentProcessId }
$chain = @()
$current = $processes[$PID]
while ($current -and $processes.ContainsKey($current) -and $chain.Count -lt 30) { $chain += $current; $current = $processes[$current] }
$focusUri = 'claude-notify://focus?pids=' + ($chain -join ',') + '&folder=' + [uri]::EscapeDataString("$env:CLAUDE_NOTIFY_FOLDER")

$template = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]::GetTemplateContent(
    [Windows.UI.Notifications.ToastTemplateType, Windows.UI.Notifications, ContentType = WindowsRuntime]::ToastText02)
$template.SelectSingleNode('//text[@id="1"]').InnerText = $env:CLAUDE_NOTIFY_TITLE
$template.SelectSingleNode('//text[@id="2"]').InnerText = $env:CLAUDE_NOTIFY_MESSAGE
$template.DocumentElement.SetAttribute('duration', 'long')
$template.DocumentElement.SetAttribute('activationType', 'protocol')
$template.DocumentElement.SetAttribute('launch', $focusUri)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($template)
`;

const macScript = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv)', 'end run'];

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function parsePayload(text) {
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return {};
  }
}

function lastMatch(text, field) {
  const pattern = new RegExp(`"${field}":"((?:[^"\\\\]|\\\\.)*)"`, 'g');
  let value = null;
  for (const match of text.matchAll(pattern)) value = match[1];
  return value === null ? null : JSON.parse(`"${value}"`);
}

/** The /rename title, else the title Claude Code generated, else null. */
function sessionTitle(transcriptPath) {
  try {
    const text = fs.readFileSync(transcriptPath, 'utf8');
    return lastMatch(text, 'customTitle') ?? lastMatch(text, 'aiTitle');
  } catch {
    return null;
  }
}

function describe(payload, readTitle = sessionTitle) {
  const folder = payload.cwd ? path.basename(payload.cwd) : '';
  const title = payload.transcript_path ? readTitle(payload.transcript_path) : null;
  return {
    folder,
    title: [folder, title].filter(Boolean).join(' · ') || appName,
    message: payload.message || 'Claude Code is waiting for you',
  };
}

function notifierFor(platform, { folder, title, message }) {
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', windowsToastScript],
        env: { ...process.env, CLAUDE_NOTIFY_FOLDER: folder, CLAUDE_NOTIFY_TITLE: title, CLAUDE_NOTIFY_MESSAGE: message },
      };
    case 'darwin':
      return { command: 'osascript', args: [...macScript.flatMap((line) => ['-e', line]), title, message] };
    default:
      return { command: 'notify-send', args: ['--app-name', appName, title, message] };
  }
}

function show(notifier) {
  return new Promise((resolve) => {
    const child = spawn(notifier.command, notifier.args, {
      env: notifier.env ?? process.env,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', resolve);
    child.on('close', resolve);
  });
}

async function main() {
  const payload = parsePayload(await readStdin());
  await show(notifierFor(process.platform, describe(payload)));
}

if (require.main === module) {
  main().catch(() => {});
}

module.exports = { describe, notifierFor, sessionTitle };

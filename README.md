# claude-notify

Shows a desktop notification when Claude Code is waiting for you. Works on Windows, macOS and Linux.

Claude Code fires a `Notification` hook when a session asks for permission and when it has waited 60 seconds for your input. claude-notify shows it as a notification titled with the folder name and the session title, e.g. _my-app · fix-login_, so you can tell which session is waiting when several run in the same folder.

The session title is the one set with `/rename`. Without one, the title Claude Code generated is used. With neither, the title is just the folder name.

## Installation

Requires Node.js 18 or later.

```sh
node install.js
```

The installer copies `src/` to `~/.claude/claude-notify/` and registers `notify.js` as the `Notification` hook in `~/.claude/settings.json`, backing the file up to `settings.json.bak` first if it changes anything. On Windows it also registers the `claude-notify://` protocol under `HKCU\Software\Classes`, so clicking the notification brings the session's window to the front. Run the installer again after changes. It does not register the hook twice.

New sessions pick up the hook at once. A session that is already running picks it up after `/hooks` or a restart.

## Platforms

| OS      | Notification                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------ |
| Windows | Toast through PowerShell, shown for about 25 seconds. Nothing to install. Click to focus window. |
| macOS   | `osascript`. The notification comes from _Script Editor_.                                        |
| Linux   | `notify-send` from `libnotify`. If it is missing, nothing is shown.                              |

The hook waits until the notification is shown, because a detached process is killed along with the hook. On Windows this takes less than a second.

## Trying it out

```sh
echo '{"cwd":"/tmp/demo","message":"Claude needs your permission to use Bash"}' | node src/notify.js
```

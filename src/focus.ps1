<#
.SYNOPSIS
Brings the window a Claude Code session runs in to the front.

.DESCRIPTION
Handler for claude-notify:// links from the notification toast. The link carries the
process chain from the hook up to the desktop, and the folder name of the session.
The first process in the chain that still owns a visible window wins. When it owns
several, the one whose title contains the folder name is preferred.

.EXAMPLE
focus.ps1 "claude-notify://focus?pids=4120,3876,2244,1508&folder=my-app"
#>
param([string]$Uri)

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ClaudeNotifyWindows {
    delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

    public static Dictionary<IntPtr, string> TopLevelWindows(uint pid) {
        var windows = new Dictionary<IntPtr, string>();
        EnumWindows((hwnd, _) => {
            uint owner;
            GetWindowThreadProcessId(hwnd, out owner);
            if (owner == pid && IsWindowVisible(hwnd) && GetWindow(hwnd, 4) == IntPtr.Zero) {
                var text = new StringBuilder(512);
                GetWindowText(hwnd, text, text.Capacity);
                if (text.Length > 0) windows[hwnd] = text.ToString();
            }
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    public static bool Focus(IntPtr hwnd) {
        if (IsIconic(hwnd)) ShowWindow(hwnd, 9);
        const byte altKey = 0x12;
        keybd_event(altKey, 0, 0, UIntPtr.Zero);
        keybd_event(altKey, 0, 2, UIntPtr.Zero);
        return SetForegroundWindow(hwnd);
    }
}
"@

Add-Type -AssemblyName System.Web
$parameters = [System.Web.HttpUtility]::ParseQueryString(([uri]$Uri).Query)
$folder = $parameters['folder']
$pids = "$($parameters['pids'])".Split(',', [StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { [uint32]$_ }

foreach ($processId in $pids) {
    $windows = [ClaudeNotifyWindows]::TopLevelWindows($processId)
    if ($windows.Count -eq 0) { continue }
    $match = $windows.GetEnumerator() | Where-Object { $folder -and $_.Value -like "*$folder*" } | Select-Object -First 1
    if (-not $match) { $match = $windows.GetEnumerator() | Select-Object -First 1 }
    [void][ClaudeNotifyWindows]::Focus($match.Key)
    exit 0
}

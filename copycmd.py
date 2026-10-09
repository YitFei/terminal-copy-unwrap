"""copycmd - unwrap text copied from the Claude Code TUI.

Claude Code hard-wraps long lines at terminal width and indents output, so
copied commands break when pasted. Copy the text, run `copycmd`, paste.
"""
import argparse
import os
import re
import sys
import unicodedata

TUI_GLYPHS = "⏺⎿●"
LIST_ITEM = re.compile(r"^\s*([-*+•]|\d+[.)]|#+)\s")
MIN_WRAP_WIDTH = 60  # below this nothing was wrapped by the TUI
TERMINAL_MARGIN = 6  # TUI wraps a bit narrower than the terminal
TUI_INDENT = 2  # base indent Claude Code adds to output


def cols(s):
    """Display width: CJK / fullwidth characters take two columns."""
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def indent_of(line):
    return len(line) - len(line.lstrip(" "))


def strip_glyph(line):
    """Replace a leading TUI marker like '⏺ ' with spaces, keeping columns."""
    stripped = line.lstrip(" ")
    if stripped[:1] and stripped[0] in TUI_GLYPHS:
        return " " * (indent_of(line) + 1) + stripped[1:]
    return line


def dedent(lines):
    """Remove the shared indent. The selection may start after the first line's
    indent, so that line only caps the shared indent at the TUI's base indent."""
    body = [l for l in lines[1:] if l.strip()] or lines
    shared = min(min(indent_of(l) for l in body), max(indent_of(lines[0]), TUI_INDENT))
    return [l[min(shared, indent_of(l)):] for l in lines]


def is_wrapped(prev, cur, width):
    """True if `cur` only starts a new line because its first word did not fit."""
    if not prev.strip() or not cur.strip():
        return False
    if prev.rstrip().endswith("\\") or LIST_ITEM.match(cur):
        return False
    return cols(prev) + 1 + cols(cur.split()[0]) > width


def is_broken_token(line, width):
    """A space-less line filling the full width is a long token (URL) cut mid-way."""
    return " " not in line.strip() and cols(line) >= width


def unwrap(text, width=None, one_line=False, terminal_width=None):
    lines = [strip_glyph(l).rstrip() for l in re.split(r"\r\n|\r|\n", text)]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return ""

    if one_line:
        parts = [l.strip().removesuffix("\\").rstrip() for l in lines if l.strip()]
        return " ".join(parts)

    if width is None:
        width = max(cols(l) for l in lines)
        if terminal_width:
            width = max(width, terminal_width - TERMINAL_MARGIN)
        if width < MIN_WRAP_WIDTH:
            return "\n".join(dedent(lines))

    out = [lines[0]]
    for prev, cur in zip(lines, lines[1:]):
        if is_wrapped(prev, cur, width):
            sep = "" if is_broken_token(prev, width) else " "
            out[-1] = out[-1] + sep + cur.strip()
        else:
            out.append(cur)
    return "\n".join(dedent(out))


def terminal_width():
    """Width of the console we run in, also when stdio is piped (e.g. `! copycmd`)."""
    for fd in (1, 2, 0):
        try:
            return os.get_terminal_size(fd).columns
        except OSError:
            pass
    try:
        with open("CONOUT$" if os.name == "nt" else "/dev/tty", "w") as tty:
            return os.get_terminal_size(tty.fileno()).columns
    except OSError:
        return None


# --- Windows clipboard -------------------------------------------------------

def _win32():
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.GetClipboardData.restype = wintypes.HANDLE
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    return ctypes, user32, kernel32


CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002


def _open_clipboard(user32):
    import time

    for _ in range(10):  # another app may hold the clipboard briefly
        if user32.OpenClipboard(None):
            return
        time.sleep(0.05)
    raise OSError("could not open the clipboard")


def get_clipboard():
    ctypes, user32, kernel32 = _win32()
    _open_clipboard(user32)
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            return ""
        ptr = kernel32.GlobalLock(handle)
        try:
            return ctypes.wstring_at(ptr)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def set_clipboard(text):
    ctypes, user32, kernel32 = _win32()
    buf = ctypes.create_unicode_buffer(text.replace("\n", "\r\n"))
    size = ctypes.sizeof(buf)
    handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, size)
    ptr = kernel32.GlobalLock(handle)
    ctypes.memmove(ptr, buf, size)
    kernel32.GlobalUnlock(handle)
    _open_clipboard(user32)
    try:
        user32.EmptyClipboard()
        if not user32.SetClipboardData(CF_UNICODETEXT, handle):
            raise OSError("could not write the clipboard")
    finally:
        user32.CloseClipboard()


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="copycmd", description="Unwrap text copied from the Claude Code TUI (clipboard in place)."
    )
    parser.add_argument("-w", "--width", type=int, help="wrap width the text was rendered at")
    parser.add_argument("-1", "--one-line", action="store_true", help="join everything into one line")
    parser.add_argument("-p", "--print-only", action="store_true", help="print, do not write the clipboard")
    args = parser.parse_args(argv)

    if os.name != "nt":
        sys.exit("copycmd: only Windows is supported")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    text = get_clipboard()
    if not text.strip():
        sys.exit("copycmd: clipboard is empty")
    result = unwrap(text, args.width, args.one_line, terminal_width())
    if not args.print_only:
        set_clipboard(result)
    print(result)


if __name__ == "__main__":
    main()

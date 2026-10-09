import os
import sys
import textwrap
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from copycmd import unwrap  # noqa: E402


def tui(text, width):
    """Render text the way Claude Code does: 2-space indent, hard wrap at width."""
    out = []
    for line in text.split("\n"):
        if not line:
            out.append("")
            continue
        out.extend(textwrap.wrap(line, width, initial_indent="  ", subsequent_indent="  ",
                                 break_on_hyphens=False))
    return "\n".join(out)


CMD = ("docker tag insighthub-nginx-proxy:latest insighthub-nginx-proxy:pre-beszel "
       "&& $DC build nginx-proxy && $DC up -d --no-deps nginx-proxy")


class UnwrapTest(unittest.TestCase):
    def test_long_command_is_joined(self):
        self.assertEqual(unwrap(tui(CMD, 70)), CMD)

    def test_short_lines_are_kept(self):
        text = "  cd /opt/InsightHub\n  DC=\"docker compose --env-file .env.deploy -f docker-compose.deploy.yml\""
        self.assertEqual(
            unwrap(text),
            'cd /opt/InsightHub\nDC="docker compose --env-file .env.deploy -f docker-compose.deploy.yml"',
        )

    def test_terminal_width_prevents_joining_longest_line(self):
        text = "  DC=\"docker compose --env-file .env.deploy -f docker-compose.deploy.yml\"\n  docker compose up -d"
        self.assertEqual(unwrap(text, terminal_width=120), text.replace("\n  ", "\n").lstrip())

    def test_paragraphs_and_list_items_are_kept(self):
        src = "Step: Hub\n\n- " + CMD + "\n- " + CMD
        self.assertEqual(unwrap(tui(src, 70)), src)

    def test_selection_starting_after_indent(self):
        self.assertEqual(unwrap(tui(CMD, 70).lstrip()), CMD)

    def test_shell_continuation_is_kept(self):
        text = ("  docker run --rm -it --name a-fairly-long-container-name-here \\\n"
                "    --env-file .env.deploy image:latest")
        self.assertEqual(unwrap(text, width=70), text.replace("\n  ", "\n").lstrip())

    def test_broken_url_joins_without_space(self):
        url = "https://example.com/" + "a" * 100
        text = "  " + url[:68] + "\n  " + url[68:]
        self.assertEqual(unwrap(text), url)

    def test_tui_glyph_removed(self):
        self.assertEqual(unwrap("⏺ " + tui(CMD, 70)[2:]), CMD)

    def test_one_line(self):
        self.assertEqual(unwrap("  cd /opt \\\n  ls -la\n\n  pwd", one_line=True), "cd /opt ls -la pwd")

    def test_cjk_width(self):
        src = "这是一段很长的中文说明文字，" * 6 + " end"
        rendered = "  " + src[:36] + "\n  " + src[36:]  # 36 CJK chars = 72 cols
        self.assertEqual(unwrap(rendered), src[:36] + " " + src[36:])


if __name__ == "__main__":
    unittest.main()

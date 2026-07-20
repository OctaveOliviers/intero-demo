"""One guard in server/routes/threads.py.

#10 _safe_id — the id guard must reject a trailing newline ('abc\\n'); a plain
slug still passes. (re.match anchors only the start; fullmatch anchors both.)
"""

import unittest

from fastapi import HTTPException

from server.routes import threads as threads_route


class SafeIdTest(unittest.TestCase):
    def test_trailing_newline_is_rejected(self):
        # re.match anchors only ^, so 'abc\n' slips past; the guard must 404 it.
        with self.assertRaises(HTTPException) as ctx:
            threads_route._safe_id("abc\n")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_plain_slug_passes(self):
        self.assertEqual(threads_route._safe_id("abc-123_XYZ"), "abc-123_XYZ")


if __name__ == "__main__":
    unittest.main()

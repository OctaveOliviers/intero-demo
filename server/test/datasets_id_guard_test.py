"""Hermetic guard for the dataset id / database-slug path-safety check.

Mirrors the tables/threads `_safe_id` fullmatch guard: `re.match` anchors only
the start, so a trailing newline ("abc\\n") slips past `^[A-Za-z0-9_-]+$`. These
helpers are pure (no auth DB), so this runs without the RBAC fixtures the rest of
``datasets_test`` needs.
"""

import unittest

from fastapi import HTTPException

from server.routes.datasets import _safe_id, _safe_slug


class DatasetIdGuardTest(unittest.TestCase):
    def test_trailing_newline_id_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            _safe_id("abc\n")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_embedded_newline_id_is_refused(self):
        for bad in ("abc\nrm", "\nabc", "a/b", ".."):
            with self.assertRaises(HTTPException):
                _safe_id(bad)

    def test_plain_id_passes(self):
        self.assertEqual(_safe_id("abc-123_XYZ"), "abc-123_XYZ")

    def test_trailing_newline_slug_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            _safe_slug("db\n")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_plain_slug_passes(self):
        self.assertEqual(_safe_slug("npda-clinical"), "npda-clinical")


if __name__ == "__main__":
    unittest.main()

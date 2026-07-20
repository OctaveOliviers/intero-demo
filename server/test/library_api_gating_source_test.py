import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
API_JS = ROOT / "app" / "src" / "lib" / "api.js"


class LibraryApiGatingSourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.src = API_JS.read_text(encoding="utf-8")

    def _extract_fn(self, name: str) -> str:
        # Match until the next exported async function (or EOF).
        pat = re.compile(
            rf"export async function {re.escape(name)}\([^)]*\)\s*\{{(?P<body>.*?)(?=\nexport async function |\Z)",
            re.S,
        )
        m = pat.search(self.src)
        self.assertIsNotNone(m, f"{name} not found in api.js")
        return m.group("body")

    def test_templates_list_and_detail_use_mock_only_when_templates_flag_enabled(self):
        list_body = self._extract_fn("listTemplates")
        detail_body = self._extract_fn("getTemplateDetail")

        self.assertIn(
            'if (isMockMode("templates")) return mockListTemplates();', list_body
        )
        self.assertIn("fetch(`${API_BASE}/api/templates`)", list_body)

        self.assertIn(
            'if (isMockMode("templates")) return mockGetTemplateDetail(templateId);',
            detail_body,
        )
        self.assertIn(
            "fetch(`${API_BASE}/api/templates/${encodeURIComponent(templateId)}`)",
            detail_body,
        )

    def test_databases_list_and_detail_use_mock_only_when_databases_flag_enabled(self):
        list_body = self._extract_fn("listDatabases")
        detail_body = self._extract_fn("getDatabaseDetail")

        self.assertIn(
            'if (isMockMode("databases")) return mockListDatabases();', list_body
        )
        self.assertIn("fetch(`${API_BASE}/api/databases`)", list_body)

        self.assertIn(
            'if (isMockMode("databases")) return mockGetDatabaseDetail(dbId);',
            detail_body,
        )
        self.assertIn(
            "fetch(`${API_BASE}/api/databases/${encodeURIComponent(dbId)}`)",
            detail_body,
        )

    def test_api_layer_has_no_static_library_fixture_imports(self):
        # Guard against reintroducing static authority in normal (non-mock) mode.
        self.assertNotIn("templateCatalog", self.src)
        self.assertNotIn("libraryData", self.src)
        self.assertNotIn("mockData", self.src)


if __name__ == "__main__":
    unittest.main(verbosity=2)

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LIBRARY_PANEL = ROOT / "app" / "src" / "components" / "LibraryPanel.svelte"
TEMPLATE_DETAIL = ROOT / "app" / "src" / "components" / "TemplateDetail.svelte"
DATABASE_DETAIL = ROOT / "app" / "src" / "components" / "DatabaseDetail.svelte"
EN_LOCALE = ROOT / "app" / "src" / "i18n" / "locales" / "en.json"


class LibraryUiMetadataRenderingSourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.panel = LIBRARY_PANEL.read_text(encoding="utf-8")
        cls.template = TEMPLATE_DETAIL.read_text(encoding="utf-8")
        cls.database = DATABASE_DETAIL.read_text(encoding="utf-8")
        cls.en = json.loads(EN_LOCALE.read_text(encoding="utf-8"))

    def test_list_cards_show_only_title_description_deadline(self):
        # Doc 9 §card face (T5): scheme/last-pulled/staleness are NOT rendered
        # on card faces — cards show title, description, and (audits) the
        # submission deadline only.
        self.assertNotIn("User-managed · no published source", self.panel)
        self.assertNotIn("No pull date", self.panel)
        self.assertIn("getDeadlineSubtitle", self.panel)
        self.assertIn("card-deadline", self.panel)

    def test_template_detail_is_the_three_section_page(self):
        # Doc 9 §Card detail (T8): the meta-fallback rows are gone; the page is
        # back-link -> title -> description -> deadline -> three chip sections.
        self.assertNotIn("User-managed · no published source", self.template)
        self.assertNotIn("No pull date", self.template)
        self.assertNotIn("No source reference", self.template)
        self.assertIn("getDeadlineSubtitle", self.template)
        self.assertIn("Inclusion criteria", self.template)
        self.assertIn("buildFieldChips", self.template)
        self.assertIn("buildDatabaseChips", self.template)

    def test_database_detail_has_consistent_missing_metadata_fallbacks(self):
        # DatabaseDetail was migrated to i18n: the missing-metadata fallbacks are
        # rendered via svelte-i18n keys, and the literal copy now lives in
        # en.json. Verify the same intent — the panel keeps a consistent
        # "user-managed / no published source" fallback for missing metadata —
        # against the migrated component.
        self.assertIn('$_("database.userManaged")', self.database)
        self.assertIn('$_("database.noPullDate")', self.database)
        self.assertIn('$_("database.noSourceRef")', self.database)
        self.assertEqual(
            self.en["database"]["userManaged"], "User-managed · no published source"
        )
        self.assertEqual(self.en["database"]["noPullDate"], "No pull date")
        self.assertEqual(self.en["database"]["noSourceRef"], "No source reference")


if __name__ == "__main__":
    unittest.main(verbosity=2)

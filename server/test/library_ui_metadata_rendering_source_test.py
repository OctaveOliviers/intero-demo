import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LIBRARY_PANEL = ROOT / "app" / "src" / "components" / "LibraryPanel.svelte"
AUDIT_DETAIL = ROOT / "app" / "src" / "components" / "AuditDetail.svelte"
DATABASE_DETAIL = ROOT / "app" / "src" / "components" / "DatabaseDetail.svelte"


class LibraryUiMetadataRenderingSourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.panel = LIBRARY_PANEL.read_text(encoding="utf-8")
        cls.audit = AUDIT_DETAIL.read_text(encoding="utf-8")
        cls.database = DATABASE_DETAIL.read_text(encoding="utf-8")

    def test_list_cards_show_only_title_description_deadline(self):
        # Doc 9 §card face (T5): scheme/last-pulled/staleness are NOT rendered
        # on card faces — cards show title, description, and (audits) the
        # submission deadline only.
        self.assertNotIn("User-managed · no published source", self.panel)
        self.assertNotIn("No pull date", self.panel)
        self.assertIn("getDeadlineSubtitle", self.panel)
        self.assertIn("card-deadline", self.panel)

    def test_audit_detail_is_the_three_section_page(self):
        # Doc 9 §Card detail (T8): the meta-fallback rows are gone; the page is
        # back-link -> title -> description -> deadline -> three chip sections.
        self.assertNotIn("User-managed · no published source", self.audit)
        self.assertNotIn("No pull date", self.audit)
        self.assertNotIn("No source reference", self.audit)
        self.assertIn("getDeadlineSubtitle", self.audit)
        self.assertIn("Inclusion criteria", self.audit)
        self.assertIn("buildFieldChips", self.audit)
        self.assertIn("buildDatabaseChips", self.audit)

    def test_database_detail_has_consistent_missing_metadata_fallbacks(self):
        self.assertIn("User-managed · no published source", self.database)
        self.assertIn("No pull date", self.database)
        self.assertIn("No source reference", self.database)


if __name__ == "__main__":
    unittest.main(verbosity=2)

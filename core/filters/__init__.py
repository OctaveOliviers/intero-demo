"""Cross-database, read-only cohort scoping for Datasets.

A Dataset is a saved, named filter over the hospital database
(library-and-sources.md). This package turns its grounded criteria into the
executable cohort: ``predicates`` builds each criterion's parameterised SQL
clause deterministically (no LLM), and ``cohort`` composes those clauses into a
joinable cohort base and proves it with a read-only ``COUNT(DISTINCT identity)``,
spanning several source databases via read-only ``ATTACH`` + measured identity
bridges. The same resolver serves the build-time validity count and run-time
scoping (inclusion-criteria-setup.md §Cross-database resolution).
"""

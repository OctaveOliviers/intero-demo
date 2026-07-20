-include .env

INTERO_SERVER_PORT ?= $(or $(PORT),8000)

.PHONY: seed dev dev-seeded db mapping mapping-npda

# Build all SQLite databases from committed CSVs.
db:
	python3 -m data.database.scripts.build_emr_db --all

# Seed var/ with pre-indexed databases and ready audits — no LLM calls — so
# the app boots ready to run audits immediately (storage-layout.md §8.4).
seed:
	python3 -m scripts.seed

# Pre-build the NPDA mapping.json under data/seed/ via the LLM mapping phase.
# Run once after spinning up the LLM (LLM_API_BASE in .env); the result is
# committed into data/seed/ and from then on `make seed` copies it into var/
# without an LLM call at run time. Cord-pH already ships a mapping in seed.
mapping-npda:
	python3 -m scripts.build_mapping npda npda-demographics npda-clinical

# Pre-build mappings for every audit that needs one. Add new audits here
# as they're introduced.
mapping: mapping-npda

# Start the API server (hot reload on :8000 by default; override with INTERO_SERVER_PORT in .env).
dev:
	python3 -m server --port $(INTERO_SERVER_PORT)

# Seed then start: a fresh start with databases already indexed.
dev-seeded: seed dev

# Quality evals (T10): re-build the seed goldens through the live pipeline and
# score the candidates (field coverage, types, codes, mapping agreement) plus
# a prepopulate fill-rate of the compiled executable against the seeded databases.
# Needs `make db seed` + a reachable model for the index/mapping stages
# (models.json). `eval-prepopulate` is the offline leg (no LLM).
eval:
	python3 -m scripts.eval_pipeline --stage all
eval-prepopulate:
	python3 -m scripts.eval_pipeline --stage prepopulate-golden

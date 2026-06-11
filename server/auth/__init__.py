"""Local auth + attribution plane (C2).

Login is required for all data access; the authenticated user is attached to
every run and every database query (doc 7 §Access, §Attribution). Accounts,
sessions, and the run/query attribution log live together in one local store
(doc 7 §Persistence — "one store, two purposes"), designed to move to
hospital-hosted, IT-planned infrastructure later without changing the access
paths. Local accounts for the MVP; SSO is out of scope.
"""

from server.auth.middleware import AuthMiddleware
from server.auth.routes import router
from server.auth.store import init_store, seed_default_user

__all__ = ["AuthMiddleware", "router", "init_store", "seed_default_user"]

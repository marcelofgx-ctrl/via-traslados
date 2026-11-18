#!/usr/bin/env python3
"""Rehearse the additive schema migration against an exported production schema WITHOUT data."""
import pathlib, sqlite3, sys, re
if len(sys.argv)!=3:
    raise SystemExit("usage: v35-rehearse-schema.py current_schema.sql candidate_schema.sql")
before=pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
candidate=pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
if re.search(r"\b(DROP\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE\s+bookings)\b",candidate,re.I):
    raise SystemExit("Migración no aditiva detectada: revisar manualmente")
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(before)
old={r[0]:r[1] for r in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
db.executescript(candidate)
db.executescript(candidate)
after={r[0]:r[1] for r in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
assert all(name in after and ddl==after[name] for name,ddl in old.items()), "Tabla histórica modificada"
must={"driver_vehicle_profiles","driver_commercial_profiles","booking_dispatch_releases","booking_quotes","booking_commission_ledger"}
assert must<=after.keys(),f"Faltan tablas comerciales: {must-after.keys()}"
triggers={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
assert {"via_quote_guard","via_quote_commit","via_commission_on_completion"}<=triggers,triggers
assert not db.execute("PRAGMA foreign_key_check").fetchall(),"Restricciones FK rotas"
print("REHEARSAL_SCHEMA_V35_OK: schema productivo exportado sin datos; tablas existentes preservadas,",len(must),"tablas comerciales, 3 triggers y migración idempotente.")

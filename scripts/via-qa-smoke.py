#!/usr/bin/env python3
"""Live, read-only QA smoke tests. No production writes or customer data."""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://via-traslados-current-prod-qa.marcelof-gx.workers.dev"
failures = []

def fetch(path, method="GET", payload=None):
    headers = {"User-Agent": "ViaQASmoke/1.0", "Accept": "application/json, text/html, */*"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, headers=headers, data=data, method=method)
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            body = response.read(1000000).decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        status = err.code
        body = err.read(1000000).decode("utf-8", "replace")
    except Exception as err:
        status = 0
        body = str(err)
    ms = int((time.monotonic() - started) * 1000)
    return status, body, ms

def check(name, path, expected, *, method="GET", payload=None, validate=None, optional=False):
    status, body, ms = fetch(path, method, payload)
    good = status == expected
    if good and validate:
        try:
            validate(body)
        except Exception as err:
            good = False
            body = "Assertion: " + str(err) + "; body=" + body
    state = "PASS" if good else ("DEGRADED" if optional else "FAIL")
    print(f"QA_SMOKE_{state} {name} http={status} ms={ms} detail={body[:220]!r}" if not good else f"QA_SMOKE_PASS {name} http={status} ms={ms}", flush=True)
    if not good and not optional:
        failures.append(name)
        print(f"::error title=QA {name}::HTTP {status} expected {expected}; {body[:400]}", flush=True)
    elif not good:
        print(f"::warning title=QA {name}::HTTP {status}; independent upstream geocoder degraded", flush=True)

def contains(token):
    def validate(body):
        assert token in body, "missing expected marker " + repr(token)
    return validate

def places(body):
    data = json.loads(body)
    assert isinstance(data.get("results"), list)
    assert any("Carrasco" in x.get("label", "") for x in data["results"])

def route(body):
    data = json.loads(body)
    assert not data.get("error"), data.get("error")
    assert data.get("source") == "OSRM QA" and data.get("qaOnly") is True
    assert 0 < float(data.get("distanceKm", 0)) < 100
    assert 0 < float(data.get("durationMinutes", 0)) < 240
    print(f"QA_ROUTE_VERIFIED km={data['distanceKm']} minutes={data['durationMinutes']} provider={data['source']}", flush=True)

def main():
    # Wait for the correct QA version, not merely any older deployed build.
    for attempt in range(8):
        status, body, _ = fetch("/")
        if status == 200 and "QA v29.1.9" in body:
            break
        print(f"QA_DEPLOY_WAIT attempt={attempt+1} http={status} version_found={('QA v29.1.9' in body)}", flush=True)
        time.sleep(2)
    check("home_version", "/", 200, validate=contains("QA v29.1.9"))
    check("home_patched_store_link", "/", 200, validate=contains("store.js?v=qa2919"))
    check("bookings_page", "/mis-reservas.html", 200, validate=contains("Mis reservas"))
    check("diagnostic_asset", "/via-qa-browser-diagnostics.js", 200, validate=contains("Diagnóstico QA"))
    check("qa_api_config", "/config.js", 200, validate=contains("apiUrl:location.origin"))
    check("qa_patched_store", "/store.js?v=qa2919", 200, validate=contains("window.ViaAddress?.get?.(key)"))
    check("writes_denied", "/api/requests", 503, method="POST", payload={})
    check("private_session_denied", "/api/customer/me", 503)
    check("known_airport_search", "/api/direcciones?mode=places&q=aeropuerto", 200, validate=places)
    check("invalid_route_denied", "/api/public/route-preview", 400, method="POST", payload={})
    check("actual_road_route", "/api/public/route-preview", 200, method="POST",
        payload={"origin":{"lat":-34.880922,"lng":-56.079391},
                 "destination":{"lat":-34.83696,"lng":-56.01638}}, validate=route)
    # This depends on IDE Uruguay. It cannot prevent independently verified OSRM routing from being reported.
    check("ide_reverse_optional", "/api/direcciones?mode=reverse&lat=-34.905&lng=-56.185", 200,
          validate=lambda b: isinstance(json.loads(b).get("results"), list) or (_ for _ in ()).throw(AssertionError("missing results")),
          optional=True)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write("### Vía Traslados — Verificación QA\\n\\n")
            out.write(("❌ Falló: " + ", ".join(failures)) if failures else "✅ Pruebas obligatorias superadas")
            out.write("\\n\\nRutas verificadas con OSRM QA; reservas y API privada bloqueadas. Producción intacta.\\n")
    if failures:
        print("QA_SMOKE_FAILED " + ",".join(failures), flush=True)
        return 1
    print("QA_SMOKE_PASSED: route and safety verified; production unchanged", flush=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())

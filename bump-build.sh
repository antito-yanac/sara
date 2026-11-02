#!/usr/bin/env bash
# ============================================================
# bump-build.sh — Sube la versión de compilación del sitio SARA.
#
# Uso:
#   ./bump-build.sh 20261101-2
#
# Qué hace (todo automático):
#   1. Escribe el nuevo build en version.json.
#   2. Actualiza <meta name="sara-build"> en los 4 HTML.
#   3. Añade/actualiza ?v=BUILD a los CSS/JS/manifest locales.
#   4. Actualiza BUILD_SW en firebase-messaging-sw.js.
#
# Con esto, cualquier pestaña abierta detecta el cambio en <=45 s y se
# recarga sola; además se rompe la caché del navegador Y la del CDN.
# ============================================================
set -euo pipefail

BUILD="${1:-}"
if [[ -z "$BUILD" ]]; then
    echo "Uso: $0 <build>   (ej: $0 20261101-2)"
    exit 1
fi

cd "$(dirname "$0")"

python3 - "$BUILD" <<'PY'
import json, re, sys, pathlib

build = sys.argv[1]
raiz = pathlib.Path(".")

# 1) version.json
version_path = raiz / "version.json"
try:
    data = json.loads(version_path.read_text(encoding="utf-8"))
except Exception:
    data = {}
data["build"] = build
version_path.write_text(
    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)

# 2 y 3) HTML: meta + ?v en assets locales
htmls = ["index.html", "strikeguard.html", "admin.html", "adminkeraunos.html"]
patron_local = re.compile(
    r'((?:href|src)=")((?:\./)?(?:style\.css|notifications\.css|css/[^"?]+|js/[^"?]+|site\.webmanifest))(\?[^"]*)?(")'
)

for nombre in htmls:
    p = raiz / nombre
    if not p.exists():
        continue
    # Leer respetando el tipo de salto de línea original (CRLF o LF)
    crudo = p.read_bytes().decode("utf-8")
    crlf = "\r\n" in crudo
    s = crudo.replace("\r\n", "\n")

    # meta sara-build
    s = re.sub(
        r'(<meta\s+name="sara-build"\s+content=")[^"]*(")',
        r'\g<1>' + build + r'\g<2>',
        s,
        flags=re.I
    )

    # ?v=BUILD en assets locales
    def _rep(m):
        return f'{m.group(1)}{m.group(2)}?v={build}{m.group(4)}'
    s = patron_local.sub(_rep, s)

    if crlf:
        s = s.replace("\n", "\r\n")
    p.write_bytes(s.encode("utf-8"))
    print(f"  actualizado {nombre}")

# 4) Service Worker
sw = raiz / "firebase-messaging-sw.js"
if sw.exists():
    s = sw.read_text(encoding="utf-8")
    s = re.sub(
        r'(const BUILD_SW\s*=\s*")[^"]*(")',
        r'\g<1>' + build + r'\g<2>',
        s
    )
    sw.write_text(s, encoding="utf-8")
    print("  actualizado firebase-messaging-sw.js")

print(f"\nBuild activo: {build}")
PY

echo
echo "Listo. Ahora haz commit y push:"
echo "  git add -A && git commit -m \"build: $BUILD\" && git push"

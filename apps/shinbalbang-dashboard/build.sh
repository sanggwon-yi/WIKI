#!/usr/bin/env bash
# 사용법: ./build.sh <versionCode> <versionName> <keystore> <password-file>
#  - base/ 의 APK에서 classes.dex·리소스를 그대로 가져오고 assets/ 만 교체
#  - versionName은 base APK의 것과 글자 수가 같아야 함 (예: 1.8 → 1.9)
#  - v1(JAR) + v2 서명, 4바이트 정렬, 서명 자체 검증까지 수행
set -euo pipefail
cd "$(dirname "$0")"
VC=$1; VN=$2; KS=$3; PWF=$4
BASE=$(ls base/*.apk | tail -1)
OUT=out/shinbalbang-dashboard-v$VN.apk
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
PW=$(cat "$PWF")
openssl pkcs12 -in "$KS" -passin "pass:$PW" -nokeys -out "$T/cert.pem" 2>/dev/null
openssl pkcs12 -in "$KS" -passin "pass:$PW" -nocerts -nodes -out "$T/key.pem" 2>/dev/null
mkdir -p out
python3 -I tools/build.py "$BASE" assets "$OUT" "$VC" "$VN" "$KS" "$PWF" "$T/key.pem" "$T/cert.pem"
python3 -I tools/apkv2.py verify "$OUT"
jarsigner -verify "$OUT" 2>&1 | grep -v JAVA_TOOL

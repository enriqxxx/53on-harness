#!/usr/bin/env bash
# .node: runs a script inside 53ON, with bash's own /dev/tcp: <script|-e code> <args>, as node would
export LC_ALL=C
P=@PORT@ T=@TOKEN@ id=$$-$RANDOM-$RANDOM b=
[ -t 0 ] || export __RUN_HAS_IN=1
a=("$(pwd -W 2>/dev/null || pwd)" "$#" "$@")
while IFS= read -r v; do a+=("$v=${!v}"); done < <(compgen -e)
n=0; for x in "${a[@]}"; do n=$((n+${#x}+1)); done
{ exec 3<>/dev/tcp/127.0.0.1/$P; } 2>/dev/null || { echo "53ON is closed: open 53ON and repeat" >&2; exit 1; }
if [ -n "${__RUN_HAS_IN:-}" ]; then
  exec 5<>/dev/tcp/127.0.0.1/$P; printf 'GET /in?id=%s&t=%s HTTP/1.1\r\nHost: 127.0.0.1:%s\r\nConnection: Upgrade\r\nUpgrade: stdin\r\n\r\n' "$id" "$T" "$P" >&5
  cat <&0 >&5 2>/dev/null & b=$!; exec 5>&-
fi
printf 'POST /run?id=%s&t=%s HTTP/1.1\r\nHost: 127.0.0.1:%s\r\nContent-Length: %d\r\n\r\n' "$id" "$T" "$P" "$n" >&3
printf '%s\0' "${a[@]}" >&3
while IFS= read -r l <&3; do [ "$l" = $'\r' ] && break; done
cat <&3; exec 3>&-
[ -n "$b" ] && kill "$b" 2>/dev/null
exec 4<>/dev/tcp/127.0.0.1/$P; printf 'GET /end?id=%s&t=%s HTTP/1.1\r\nHost: 127.0.0.1:%s\r\n\r\n' "$id" "$T" "$P" >&4
while IFS= read -r l <&4; do [ "$l" = $'\r' ] && break; done
IFS= read -r c <&4; while IFS= read -r l <&4 || [ -n "$l" ]; do printf '%s\n' "$l" >&2; done
exit "${c:-1}"

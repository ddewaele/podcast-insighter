#!/usr/bin/env bash
# Stop development servers running on backend (30xx) and frontend (51xx) ports.
# Lists processes, then lets you kill all or select specific PIDs.
# Compatible with bash 3.x (macOS default).

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo -e "\n${BOLD}Scanning ports 3000–3099 (backend) and 5100–5199 (frontend)...${NC}\n"

# Use lsof to list all listeners, then filter by port range in awk.
# lsof LISTEN lines look like: ... TCP *:3001 (LISTEN)
# $NF is "(LISTEN)", $(NF-1) is the address ("*:3001" or "[::1]:5173").
RAW=$(lsof -i -P -n 2>/dev/null | awk '
  /LISTEN/ {
    n = split($(NF-1), a, ":")
    port = a[n] + 0
    if ((port >= 3000 && port <= 3099) || (port >= 5100 && port <= 5199)) print
  }
' || true)

if [[ -z "$RAW" ]]; then
  echo -e "${GREEN}✓  No processes found on those ports. Nothing to stop.${NC}\n"
  exit 0
fi

# De-duplicate and format: "PID COMMAND PORT(S)" — one line per unique PID
TABLE=$(echo "$RAW" \
  | awk '{
      pid=$2; cmd=$1
      # $(NF-1) is the address ("*:3001", "[::1]:5173"); $NF is "(LISTEN)"
      split($(NF-1), parts, ":")
      port = parts[length(parts)]
      gsub(/[^0-9]/, "", port)
      if (port == "") next
      if (seen[pid] == "") {
        order[++n] = pid
        cmds[pid] = cmd
      }
      ports[pid] = (ports[pid] == "") ? port : ports[pid] ", " port
      seen[pid] = 1
    }
    END {
      for (i=1; i<=n; i++) {
        pid = order[i]
        printf "%-10s  %-22s  %s\n", pid, cmds[pid], ports[pid]
      }
    }')

if [[ -z "$TABLE" ]]; then
  echo -e "${GREEN}✓  No processes found on those ports. Nothing to stop.${NC}\n"
  exit 0
fi

printf "${BOLD}%-10s  %-22s  %s${NC}\n" "PID" "COMMAND" "PORT(S)"
printf "${DIM}%-10s  %-22s  %s${NC}\n" "─────────" "─────────────────────" "──────────────"
echo "$TABLE"

echo -e "\n${YELLOW}Options:${NC}"
echo "  a          – kill all listed processes"
echo "  <pid> ...  – space-separated PIDs to kill"
echo "  q          – quit without killing anything"
echo ""
printf "Choice: "
read -r INPUT < /dev/tty

kill_pid() {
  local pid="$1"
  if kill -SIGTERM "$pid" 2>/dev/null; then
    echo -e "  ${GREEN}✓  PID $pid stopped${NC}"
  else
    echo -e "  ${RED}✗  PID $pid — not found or permission denied${NC}"
  fi
}

echo ""
case "$INPUT" in
  q|Q|"")
    echo -e "${DIM}Aborted. No processes were killed.${NC}\n"
    ;;
  a|A)
    ALL_PIDS=$(echo "$TABLE" | awk '{print $1}')
    for pid in $ALL_PIDS; do kill_pid "$pid"; done
    echo ""
    ;;
  *)
    for token in $INPUT; do
      if [[ "$token" =~ ^[0-9]+$ ]]; then
        kill_pid "$token"
      else
        echo -e "  ${YELLOW}⚠  '$token' is not a valid PID — skipping${NC}"
      fi
    done
    echo ""
    ;;
esac

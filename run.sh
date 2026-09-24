#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Research Copilot — Dev Runner
# Usage:
#   ./run.sh            → start both backend + frontend
#   ./run.sh backend    → backend only  (port 8000)
#   ./run.sh frontend   → frontend only (port 5173)
#   ./run.sh stop       → kill all running instances
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$PROJECT_ROOT/.venv"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOG_DIR="$PROJECT_ROOT/.logs"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}${BOLD}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}${BOLD}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}${BOLD}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}${BOLD}[ERROR]${RESET} $*" >&2; }

# ── Helpers ───────────────────────────────────────────────────────────────────
ensure_logs() {
    mkdir -p "$LOG_DIR"
}

check_venv() {
    if [[ ! -f "$VENV/bin/activate" ]]; then
        warn "Python venv not found. Creating one..."
        python3 -m venv "$VENV"
        # shellcheck source=/dev/null
        source "$VENV/bin/activate"
        pip install -q --upgrade pip
        pip install -q -r "$PROJECT_ROOT/requirements.txt"
        success "Python venv ready."
    fi
}

check_node() {
    if ! command -v node &>/dev/null; then
        error "Node.js is not installed. Install it from https://nodejs.org"
        exit 1
    fi
    if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
        info "Installing frontend dependencies..."
        cd "$FRONTEND_DIR" && npm install --silent
        success "Frontend dependencies installed."
    fi
}

kill_pid_file() {
    local pid_file="$1"
    local name="$2"
    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(<"$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" && success "Stopped $name (PID $pid)"
        else
            warn "$name was not running (stale PID file)"
        fi
        rm -f "$pid_file"
    else
        warn "No PID file found for $name"
    fi
}

# ── Start Backend ─────────────────────────────────────────────────────────────
start_backend() {
    info "Starting backend (FastAPI/Uvicorn) on http://localhost:8000 ..."
    check_venv
    ensure_logs

    # shellcheck source=/dev/null
    source "$VENV/bin/activate"

    cd "$PROJECT_ROOT"
    nohup uvicorn src.api.app:create_app \
        --factory \
        --host 0.0.0.0 \
        --port 8000 \
        --reload \
        --log-level info \
        > "$BACKEND_LOG" 2>&1 &

    echo $! > "$BACKEND_PID_FILE"
    success "Backend started  → http://localhost:8000  (log: .logs/backend.log)"
    success "API Docs         → http://localhost:8000/docs"
}

# ── Start Frontend ────────────────────────────────────────────────────────────
start_frontend() {
    info "Starting frontend (Vite/React) on http://localhost:5173 ..."
    check_node
    ensure_logs

    cd "$FRONTEND_DIR"
    nohup npm run dev -- --host 0.0.0.0 \
        > "$FRONTEND_LOG" 2>&1 &

    echo $! > "$FRONTEND_PID_FILE"
    success "Frontend started → http://localhost:5173  (log: .logs/frontend.log)"
}

# ── Stop ──────────────────────────────────────────────────────────────────────
stop_all() {
    info "Stopping Research Copilot..."
    kill_pid_file "$BACKEND_PID_FILE"  "Backend"
    kill_pid_file "$FRONTEND_PID_FILE" "Frontend"
    success "All processes stopped."
}

# ── Main ──────────────────────────────────────────────────────────────────────
MODE="${1:-both}"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       Research Copilot — Dev Runner      ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""

case "$MODE" in
    backend)
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
    stop)
        stop_all
        ;;
    both|"")
        start_backend
        sleep 1
        start_frontend
        echo ""
        echo -e "${BOLD}  Running:${RESET}"
        echo -e "  ${GREEN}●${RESET} Backend   → http://localhost:8000"
        echo -e "  ${GREEN}●${RESET} API Docs  → http://localhost:8000/docs"
        echo -e "  ${GREEN}●${RESET} Frontend  → http://localhost:5173"
        echo ""
        echo -e "  Logs: ${CYAN}.logs/backend.log${RESET}  |  ${CYAN}.logs/frontend.log${RESET}"
        echo -e "  Stop: ${YELLOW}./run.sh stop${RESET}"
        echo ""
        ;;
    *)
        error "Unknown mode: $MODE"
        echo "Usage: ./run.sh [both|backend|frontend|stop]"
        exit 1
        ;;
esac

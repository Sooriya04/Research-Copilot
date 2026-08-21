"""
Universal color logger for all Research Copilot Python services.
Usage:
    from services.shared.logger import log_info, log_error, log_warn, log_success, log_pipeline
"""

import logging
import sys

# ANSI color codes
RESET   = "\033[0m"
RED     = "\033[31m"
GREEN   = "\033[32m"
YELLOW  = "\033[33m"
CYAN    = "\033[36m"
MAGENTA = "\033[35m"
BOLD    = "\033[1m"


class ColorFormatter(logging.Formatter):
    LEVEL_COLORS = {
        logging.DEBUG:    CYAN,
        logging.INFO:     CYAN,
        logging.WARNING:  YELLOW,
        logging.ERROR:    BOLD + RED,
        logging.CRITICAL: BOLD + RED,
    }

    def format(self, record: logging.LogRecord) -> str:
        color = self.LEVEL_COLORS.get(record.levelno, RESET)
        record.msg = f"{color}{record.msg}{RESET}"
        return super().format(record)


def get_logger(name: str) -> logging.Logger:
    """Return a colored logger for the given service name."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            ColorFormatter(
                fmt="%(asctime)s [%(name)s] %(message)s",
                datefmt="%Y/%m/%d %H:%M:%S",
            )
        )
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        logger.propagate = False
    return logger


# --- Convenience helpers (use these directly) ---

def log_info(logger: logging.Logger, msg: str) -> None:
    logger.info(f"{CYAN}{msg}{RESET}")

def log_success(logger: logging.Logger, msg: str) -> None:
    logger.info(f"{GREEN}✅ {msg}{RESET}")

def log_warn(logger: logging.Logger, msg: str) -> None:
    logger.warning(f"{YELLOW}⚠️  {msg}{RESET}")

def log_error(logger: logging.Logger, msg: str) -> None:
    logger.error(f"{BOLD}{RED}❌ {msg}{RESET}")

def log_pipeline(logger: logging.Logger, msg: str) -> None:
    logger.info(f"{MAGENTA}🔧 {msg}{RESET}")

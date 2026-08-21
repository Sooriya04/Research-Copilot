package core

import (
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

// ANSI color codes
const (
	colorReset   = "\033[0m"
	colorRed     = "\033[31m"
	colorGreen   = "\033[32m"
	colorYellow  = "\033[33m"
	colorBlue    = "\033[34m"
	colorMagenta = "\033[35m"
	colorCyan    = "\033[36m"
	colorBold    = "\033[1m"
)

var coreLogger = log.New(os.Stdout, "", log.Ldate|log.Ltime)

// ColorWriter intercepts standard logs and injects terminal colors based on content
type ColorWriter struct {
	Val io.Writer
}

func (w *ColorWriter) Write(p []byte) (n int, err error) {
	str := string(p)

	hasError := strings.Contains(str, "failed") ||
		strings.Contains(str, "Failed") ||
		strings.Contains(str, "error") ||
		strings.Contains(str, "Error") ||
		strings.Contains(str, "violates") ||
		strings.Contains(str, "status 418") ||
		strings.Contains(str, "status 500") ||
		strings.Contains(str, "status 403") ||
		strings.Contains(str, "status 400") ||
		strings.Contains(str, "unreachable") ||
		strings.Contains(str, "canceled")

	hasSuccess := strings.Contains(str, "Successfully") ||
		strings.Contains(str, "successfully") ||
		strings.Contains(str, "Success") ||
		strings.Contains(str, "success") ||
		strings.Contains(str, "completed") ||
		strings.Contains(str, "Completed")

	if hasError {
		return fmt.Fprintf(w.Val, "%s%s%s%s", colorBold, colorRed, str, colorReset)
	} else if hasSuccess {
		return fmt.Fprintf(w.Val, "%s%s%s", colorGreen, str, colorReset)
	}

	if strings.Contains(str, "[INGESTION]") {
		return fmt.Fprintf(w.Val, "%s%s%s", colorCyan, str, colorReset)
	} else if strings.Contains(str, "[DOWNLOAD]") {
		return fmt.Fprintf(w.Val, "%s%s%s", colorBlue, str, colorReset)
	} else if strings.Contains(str, "[EXTRACT]") {
		return fmt.Fprintf(w.Val, "%s%s%s", colorMagenta, str, colorReset)
	}

	return w.Val.Write(p)
}

// SetupGlobalLogger wraps standard Go log output in ColorWriter
func SetupGlobalLogger() {
	log.SetOutput(&ColorWriter{Val: os.Stdout})
}

// LogInfo prints a cyan info message
func LogInfo(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	coreLogger.Printf("%s%s%s", colorCyan, msg, colorReset)
}

// LogSuccess prints a green success message
func LogSuccess(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	coreLogger.Printf("%s%s%s", colorGreen, msg, colorReset)
}

// LogWarn prints a yellow warning message
func LogWarn(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	coreLogger.Printf("%s⚠️  %s%s", colorYellow, msg, colorReset)
}

// LogError prints a bold red error message
func LogError(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	coreLogger.Printf("%s❌ %s%s", colorBold+colorRed, msg, colorReset)
}

// LogPipeline prints a magenta pipeline/job message
func LogPipeline(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	coreLogger.Printf("%s🔧 %s%s", colorMagenta, msg, colorReset)
}

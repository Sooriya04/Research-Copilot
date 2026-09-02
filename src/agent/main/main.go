package main

import (
	"flag"
	"research_copilot/src/agent"
)

func main() {
	port := flag.Int("port", 8101, "Port to run repair agent server on")
	flag.Parse()

	agent.StartRepairAgentServer(*port)
}

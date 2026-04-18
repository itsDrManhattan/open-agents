import type { Metadata } from "next";
import { HarnessDashboard } from "./harness-dashboard";

export const metadata: Metadata = {
  title: "Harness — Agent Evals",
  description:
    "Run benchmarks against any agent in isolated sandboxes and compare results.",
};

export default function HarnessPage() {
  return <HarnessDashboard />;
}

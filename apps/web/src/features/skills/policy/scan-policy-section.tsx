import { Section } from "@/components/layout/section"
import { useScanning } from "../use-scanning"
import { ScanPolicyCard } from "./scan-policy-card"

/** Only shown when the deployment has scanning on; otherwise there is nothing to configure. */
export function ScanPolicySection() {
  const scanning = useScanning()
  if (scanning?.enabled !== true) return null
  const { policy } = scanning
  return (
    <Section title="Skill scanning" description="Skill versions are checked for prompt injection, exfiltration and risky scripts before agents are served them. Experimental.">
      <ScanPolicyCard key={`${policy.blockAt}-${policy.requireScan}`} scanning={scanning} />
    </Section>
  )
}

import { Button } from "@/components/ui/button";

// NEVR-315 seeded-violation scratch branch: one deliberate violation per
// starter contract. Never merge; exists to prove the design-contract pass
// catches net-new violations with actionable remediation messages.
export function DesignContractSeed() {
	return (
		<div className="bg-pink-500 p-[13px]">
			<Button className="p-4">seeded violation</Button>
		</div>
	);
}

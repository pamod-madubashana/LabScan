import { NetworkMapFlow } from "@/components/network/NetworkMapFlow";
import { useLabScan } from "@/lib/labscan";

const NetworkMap = () => {
  const { state } = useLabScan();

  return (
    <div className="p-5 flex flex-col h-full min-w-0 overflow-x-hidden">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Network Map</h2>
        <p className="text-xs text-muted-foreground font-mono">{state.devices.length} agents · gateway-based topology (SNMP/manual discovery optional)</p>
      </div>

      <div className="flex-1 min-w-0">
        <NetworkMapFlow />
      </div>
    </div>
  );
};

export default NetworkMap;

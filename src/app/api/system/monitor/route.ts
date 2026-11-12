import si from "systeminformation";
import { withPrivilegedAdministration } from "@/lib/tenancy/privileged";

// Ensure this route is dynamic
export const dynamic = "force-dynamic";

export function GET(request: Request) {
    return withPrivilegedAdministration(request, {
        name: "SYSTEM_MONITOR_READ", action: "READ", resourceType: "SystemMonitor",
    }, async () => {
        const [cpu, mem, os, fsSize, networkStats] = await Promise.all([
            si.currentLoad(), si.mem(), si.osInfo(), si.fsSize(), si.networkStats(),
        ]);
        const processMemory = process.memoryUsage();
        const data = {
            cpu: { load: cpu.currentLoad, cores: cpu.cpus.map((core) => core.load) },
            memory: {
                total: mem.total, used: mem.active, free: mem.available,
                swapTotal: mem.swaptotal, swapUsed: mem.swapused,
            },
            disk: fsSize.map((disk) => ({
                fs: disk.fs, mount: disk.mount, size: disk.size, used: disk.used, usePercent: disk.use,
            })),
            network: networkStats.map((net) => ({
                iface: net.iface, rx_sec: net.rx_sec, tx_sec: net.tx_sec, state: net.operstate,
            })).filter((net) => net.state === "up" || net.rx_sec > 0 || net.tx_sec > 0),
            os: { platform: os.platform, distro: os.distro, release: os.release, uptime: si.time().uptime },
            process: {
                uptime: process.uptime(), heapTotal: processMemory.heapTotal,
                heapUsed: processMemory.heapUsed, rss: processMemory.rss,
            },
        };
        return { data: { status: true, message: "System metrics fetched successfully", data } };
    });
}

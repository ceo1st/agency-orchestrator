import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/studio";

export type BackendStatus = "checking" | "online" | "offline";

export function useBackend() {
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [version, setVersion] = useState<string | null>(null);
  // 引擎进程启动后代码被重新构建（server.js/dist 更新）→ 内存里跑的是旧代码，
  // 会出现"前端认识、引擎 unknown provider"之类的版本漂移——提示用户重启引擎
  const [stale, setStale] = useState(false);

  const check = useCallback(async () => {
    try {
      const h = await api.health();
      setVersion(h.version ?? null);
      setStale(h.stale === true);
      setStatus("online");
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(check, 5000);
    return () => window.clearInterval(id);
  }, [check]);

  return { status, version, stale, recheck: check };
}
